type AnswerDepth = "instinct" | "balanced" | "precise" | "thinking";
type AnswerStatus =
  | "completed"
  | "incomplete"
  | "failed"
  | "cancelled"
  | "stream_error"
  | "ended";

type ModelName = "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";
type ServiceTier = "standard" | "fast";

export type AnswerMetric = {
  event: "answer_metric";
  model: ModelName;
  depth: AnswerDepth;
  reasoningEffort: "none" | "low" | "medium";
  serviceTier: ServiceTier;
  status: AnswerStatus;
  httpStatus: number;
  firstReadableMs: number | null;
  durationMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCostMicroUSD: number;
  pricingVersion: "2026-07-30";
};

export type AnswerMetricInput = {
  model: string;
  depth: string;
  reasoningEffort: string;
  serviceTier: string | null;
  httpStatus: number;
  startedAt: number;
};

type ObservedAnswerStream = {
  body: ReadableStream<Uint8Array>;
  completion: Promise<AnswerMetric>;
};

type UsageShape = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  input_tokens_details?: { cached_tokens?: unknown };
  output_tokens_details?: { reasoning_tokens?: unknown };
};

type ResponseShape = {
  model?: unknown;
  service_tier?: unknown;
  usage?: UsageShape;
};

type StreamEvent = {
  type?: unknown;
  delta?: unknown;
  text?: unknown;
  response?: ResponseShape;
};

type Pricing = {
  input: number;
  cachedInput: number;
  output: number;
};

// USD per one million short-context tokens, published by OpenAI on
// 2026-07-30. CueAside's bounded interview prompts remain short-context.
// Fast mode is exactly twice the Standard rate for these three models.
const STANDARD_PRICING: Record<ModelName, Pricing> = {
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-sol": { input: 5, cachedInput: 0.5, output: 30 },
};

const MAX_SSE_LINE_CHARACTERS = 256_000;

function closedModel(value: unknown): ModelName {
  switch (value) {
    case "gpt-5.6-luna":
    case "gpt-5.6-terra":
    case "gpt-5.6-sol":
      return value;
    default:
      return "gpt-5.6-terra";
  }
}

function closedDepth(value: unknown): AnswerDepth {
  switch (value) {
    case "instinct":
    case "balanced":
    case "precise":
    case "thinking":
      return value;
    default:
      return "balanced";
  }
}

function closedEffort(value: unknown): AnswerMetric["reasoningEffort"] {
  switch (value) {
    case "low":
    case "medium":
      return value;
    default:
      return "none";
  }
}

function closedTier(value: unknown): ServiceTier {
  return value === "fast" || value === "priority" ? "fast" : "standard";
}

function boundedInteger(value: unknown, maximum = 100_000_000): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(maximum, Math.floor(parsed));
}

function boundedMilliseconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(300_000, Math.round(value));
}

export function failedAnswerMetric(
  input: AnswerMetricInput,
  status: Extract<AnswerStatus, "failed" | "stream_error"> = "failed",
): AnswerMetric {
  return {
    event: "answer_metric",
    model: closedModel(input.model),
    depth: closedDepth(input.depth),
    reasoningEffort: closedEffort(input.reasoningEffort),
    serviceTier: closedTier(input.serviceTier),
    status,
    httpStatus: Math.min(599, Math.max(0, Math.floor(input.httpStatus))),
    firstReadableMs: null,
    durationMs: boundedMilliseconds(Date.now() - input.startedAt),
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostMicroUSD: 0,
    pricingVersion: "2026-07-30",
  };
}

export function estimateAnswerCostMicroUSD(input: {
  model: string;
  serviceTier: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}): number {
  const model = closedModel(input.model);
  const multiplier = closedTier(input.serviceTier) === "fast" ? 2 : 1;
  const pricing = STANDARD_PRICING[model];
  const inputTokens = boundedInteger(input.inputTokens);
  const cachedInputTokens = Math.min(
    inputTokens,
    boundedInteger(input.cachedInputTokens),
  );
  const outputTokens = boundedInteger(input.outputTokens);
  const uncachedInputTokens = inputTokens - cachedInputTokens;

  // A price expressed in USD / 1M tokens multiplied by a token count is the
  // same numeric value in micro-USD, so no floating 1e6 conversion is needed.
  return Math.max(0, Math.round(multiplier * (
    uncachedInputTokens * pricing.input
    + cachedInputTokens * pricing.cachedInput
    + outputTokens * pricing.output
  )));
}

/**
 * Proxies an OpenAI SSE stream byte-for-byte while extracting only bounded,
 * numeric performance metadata. Delta text is checked only for non-whitespace
 * to establish first-readable latency and is never retained or logged.
 */
export function observeAnswerStream(
  upstream: ReadableStream<Uint8Array>,
  input: AnswerMetricInput,
): ObservedAnswerStream {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let actualModel = closedModel(input.model);
  let actualTier = closedTier(input.serviceTier);
  let firstReadableMs: number | null = null;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let terminalStatus: AnswerStatus | null = null;
  let resolveCompletion!: (metric: AnswerMetric) => void;
  let didComplete = false;

  const completion = new Promise<AnswerMetric>((resolve) => {
    resolveCompletion = resolve;
  });

  const readUsage = (response: ResponseShape | undefined) => {
    if (!response) return;
    actualModel = closedModel(response.model ?? actualModel);
    actualTier = closedTier(response.service_tier ?? actualTier);
    inputTokens = boundedInteger(response.usage?.input_tokens);
    cachedInputTokens = Math.min(
      inputTokens,
      boundedInteger(response.usage?.input_tokens_details?.cached_tokens),
    );
    outputTokens = boundedInteger(response.usage?.output_tokens);
    reasoningTokens = Math.min(
      outputTokens,
      boundedInteger(response.usage?.output_tokens_details?.reasoning_tokens),
    );
  };

  const observeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) return;
    const raw = trimmed.slice("data: ".length);
    if (!raw || raw === "[DONE]" || raw.length > MAX_SSE_LINE_CHARACTERS) {
      return;
    }

    let event: StreamEvent;
    try {
      event = JSON.parse(raw) as StreamEvent;
    } catch {
      return;
    }

    if (
      firstReadableMs === null
      && (event.type === "response.output_text.delta"
        || event.type === "response.output_text.done")
    ) {
      const candidate = event.type === "response.output_text.delta"
        ? event.delta
        : event.text;
      if (typeof candidate === "string" && candidate.trim()) {
        firstReadableMs = boundedMilliseconds(Date.now() - input.startedAt);
      }
    }

    if (event.type === "response.created") {
      readUsage(event.response);
    } else if (event.type === "response.completed") {
      readUsage(event.response);
      terminalStatus = "completed";
    } else if (event.type === "response.incomplete") {
      readUsage(event.response);
      terminalStatus = "incomplete";
    } else if (event.type === "response.failed" || event.type === "error") {
      readUsage(event.response);
      terminalStatus = "failed";
    }
  };

  const observeChunk = (chunk: Uint8Array, final = false) => {
    carry += decoder.decode(chunk, { stream: !final });
    const lines = carry.split(/\r?\n/);
    carry = lines.pop() ?? "";
    for (const line of lines) observeLine(line);
    if (carry.length > MAX_SSE_LINE_CHARACTERS) carry = "";
    if (final && carry) {
      observeLine(carry);
      carry = "";
    }
  };

  const finish = (fallbackStatus: AnswerStatus) => {
    if (didComplete) return;
    didComplete = true;
    const status = terminalStatus ?? fallbackStatus;
    resolveCompletion({
      event: "answer_metric",
      model: actualModel,
      depth: closedDepth(input.depth),
      reasoningEffort: closedEffort(input.reasoningEffort),
      serviceTier: actualTier,
      status,
      httpStatus: Math.min(599, Math.max(0, Math.floor(input.httpStatus))),
      firstReadableMs,
      durationMs: boundedMilliseconds(Date.now() - input.startedAt),
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningTokens,
      estimatedCostMicroUSD: estimateAnswerCostMicroUSD({
        model: actualModel,
        serviceTier: actualTier,
        inputTokens,
        cachedInputTokens,
        outputTokens,
      }),
      pricingVersion: "2026-07-30",
    });
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          observeChunk(new Uint8Array(), true);
          finish("ended");
          controller.close();
          return;
        }
        observeChunk(next.value);
        controller.enqueue(next.value);
      } catch (error) {
        finish("stream_error");
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finish("cancelled");
      }
    },
  });

  return { body, completion };
}

/** Closed, content-free log record suitable for Vercel/Sentry drains. */
export function logAnswerMetric(metric: AnswerMetric): void {
  const record = JSON.stringify(metric);
  if (metric.status === "completed") {
    console.log(record);
  } else {
    console.error(record);
  }
}

/** Closed failure signal; never attach the thrown database error. */
export function logAnswerMetricPersistenceFailure(): void {
  console.error(JSON.stringify({
    event: "answer_metric_persist_failed",
  }));
}
