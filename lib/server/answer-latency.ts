export const ANSWER_ROUTES = {
  instinct: {
    model: "gpt-5.6-luna",
    effort: "none",
    serviceTier: null,
    firstReadableTimeoutMs: null,
    fallbackDepth: null,
  },
  balanced: {
    model: "gpt-5.6-terra",
    effort: "none",
    serviceTier: null,
    firstReadableTimeoutMs: 4_500,
    fallbackDepth: "instinct",
  },
  precise: {
    model: "gpt-5.6-terra",
    effort: "none",
    serviceTier: "fast",
    firstReadableTimeoutMs: 4_500,
    fallbackDepth: "instinct",
  },
  thinking: {
    model: "gpt-5.6-sol",
    effort: "low",
    serviceTier: null,
    firstReadableTimeoutMs: 6_000,
    fallbackDepth: "precise",
  },
} as const;

export type AnswerDepth = keyof typeof ANSWER_ROUTES;

export function isAnswerDepth(value: unknown): value is AnswerDepth {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(ANSWER_ROUTES, value);
}

export function inferAnswerDepth(
  requestedDepth: unknown,
  requestedModel: unknown,
  requestedEffort: unknown,
): AnswerDepth {
  if (isAnswerDepth(requestedDepth)) return requestedDepth;

  const model = typeof requestedModel === "string" ? requestedModel : "";
  const effort =
    typeof requestedEffort === "string"
      ? requestedEffort.toLowerCase()
      : "none";

  if (model === "gpt-5.6-luna") return "instinct";
  if (model === "gpt-5.6-terra") return "balanced";
  if (
    model === "gpt-5.6-sol" &&
    ["low", "medium", "high", "xhigh", "max"].includes(effort)
  ) {
    return "thinking";
  }
  if (model === "gpt-5.6-sol") return "precise";
  return "balanced";
}

export function containsReadableAnswerEvent(value: string): boolean {
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;
    try {
      const event = JSON.parse(trimmed.slice("data: ".length)) as {
        type?: unknown;
        delta?: unknown;
        text?: unknown;
      };
      if (
        event.type === "response.output_text.delta"
        && typeof event.delta === "string"
        && event.delta.trim().length > 0
      ) {
        return true;
      }
      if (
        event.type === "response.output_text.done"
        && typeof event.text === "string"
        && event.text.trim().length > 0
      ) {
        return true;
      }
    } catch {
      // The final JSON line may span multiple network chunks. The accumulated
      // probe is checked again as soon as the rest arrives.
    }
  }
  return false;
}

export type DeadlineResult<T> =
  | { kind: "settled"; value: T }
  | { kind: "rejected"; error: unknown }
  | { kind: "timeout" };

export async function settleBeforeDeadline<T>(
  promise: Promise<T>,
  deadlineAt: number,
): Promise<DeadlineResult<T>> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return { kind: "timeout" };

  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve({ kind: "timeout" });
    }, remaining);

    promise.then(
      (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ kind: "settled", value });
      },
      (error: unknown) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ kind: "rejected", error });
      },
    );
  });
}

export type FirstReadableResult = {
  kind: "readable" | "ended" | "timeout";
  buffered: Uint8Array[];
};

export type AnswerStreamSource = {
  body: ReadableStream<Uint8Array>;
  abort: (reason: unknown) => void;
};

/**
 * Holds the small preamble of a Responses SSE stream until the first text
 * event. That lets the caller discard response.created/reasoning events and
 * switch models without exposing two interleaved responses to the client.
 */
export async function waitForFirstReadableAnswer(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadlineAt: number,
  maximumBufferedBytes = 256 * 1_024,
): Promise<FirstReadableResult> {
  const buffered: Uint8Array[] = [];
  const decoder = new TextDecoder();
  let probe = "";
  let bufferedBytes = 0;

  while (true) {
    const read = settleBeforeDeadline(reader.read(), deadlineAt);
    const result = await read;

    if (result.kind === "timeout") {
      return { kind: "timeout", buffered };
    }
    if (result.kind === "rejected") {
      throw result.error;
    }
    if (result.value.done) {
      return { kind: "ended", buffered };
    }

    const chunk = result.value.value;
    buffered.push(chunk);
    bufferedBytes += chunk.byteLength;
    probe += decoder.decode(chunk, { stream: true });
    if (probe.length > 64 * 1_024) {
      probe = probe.slice(-64 * 1_024);
    }

    if (containsReadableAnswerEvent(probe)) {
      return { kind: "readable", buffered };
    }

    // A normal Responses preamble is tiny. Treat a very large non-text
    // preamble as an unusable first response rather than buffering forever.
    if (bufferedBytes > maximumBufferedBytes) {
      return { kind: "timeout", buffered };
    }
  }
}

async function pipeReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  downstream: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    downstream.enqueue(value);
  }
}

/**
 * Exposes exactly one SSE response. The primary preamble stays private until
 * its first output-text event. If the deadline wins, the primary reader is
 * canceled before the fallback factory is called, so CueAside never launches
 * both provider attempts concurrently and the client never receives mixed
 * response IDs or model metadata.
 */
export function createSequentialAnswerStream(input: {
  primary: AnswerStreamSource;
  deadlineAt: number;
  fallback: () => Promise<AnswerStreamSource>;
  errorChunk: () => Uint8Array;
  suppressError?: () => boolean;
  onCancel?: (reason: unknown) => void;
}): ReadableStream<Uint8Array> {
  let activeSource = input.primary;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let wasCancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(downstream) {
      try {
        activeReader = activeSource.body.getReader();
        let firstReadable;
        try {
          firstReadable = await waitForFirstReadableAnswer(
            activeReader,
            input.deadlineAt,
          );
        } catch {
          firstReadable = { kind: "ended" as const, buffered: [] };
        }

        if (firstReadable.kind === "readable") {
          for (const chunk of firstReadable.buffered) {
            downstream.enqueue(chunk);
          }
          await pipeReader(activeReader, downstream);
          downstream.close();
          return;
        }

        if (wasCancelled) return;

        activeSource.abort("first_readable_timeout");
        await activeReader.cancel("first_readable_timeout").catch(() => {});
        if (wasCancelled) return;
        activeSource = await input.fallback();
        activeReader = activeSource.body.getReader();
        await pipeReader(activeReader, downstream);
        downstream.close();
      } catch {
        activeSource.abort("answer_stream_failed");
        if (!wasCancelled && !input.suppressError?.()) {
          downstream.enqueue(input.errorChunk());
          downstream.close();
        }
      }
    },
    async cancel(reason) {
      wasCancelled = true;
      activeSource.abort(reason);
      input.onCancel?.(reason);
      await activeReader?.cancel(reason).catch(() => {});
    },
  });
}
