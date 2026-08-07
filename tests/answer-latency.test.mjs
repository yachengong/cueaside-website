import test from "node:test";
import assert from "node:assert/strict";
import {
  ANSWER_ROUTES,
  containsReadableAnswerEvent,
  createSequentialAnswerStream,
  inferAnswerDepth,
  settleBeforeDeadline,
  waitForFirstReadableAnswer,
} from "../lib/server/answer-latency.ts";

async function readAll(stream) {
  const chunks = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test("keeps the four answer-depth routes explicit", () => {
  assert.deepEqual(ANSWER_ROUTES, {
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
  });
});

test("infers only a known internal depth", () => {
  assert.equal(inferAnswerDepth("thinking", "ignored", "none"), "thinking");
  assert.equal(inferAnswerDepth("unknown", "gpt-5.6-luna", "none"), "instinct");
  assert.equal(inferAnswerDepth(null, "gpt-5.6-terra", "none"), "balanced");
  assert.equal(inferAnswerDepth(null, "gpt-5.6-sol", "low"), "thinking");
  assert.equal(inferAnswerDepth(null, "gpt-5.6-sol", "none"), "precise");
  assert.equal(inferAnswerDepth(null, "attacker-model", "max"), "balanced");
  assert.equal(inferAnswerDepth("toString", "attacker-model", "max"), "balanced");
});

test("recognizes only model-authored output text as readable", () => {
  assert.equal(
    containsReadableAnswerEvent('data: {"type":"response.created"}'),
    false,
  );
  assert.equal(
    containsReadableAnswerEvent(
      'data: {"type":"response.output_text.delta","delta":"First"}',
    ),
    true,
  );
  assert.equal(
    containsReadableAnswerEvent(
      'data: {"type":"response.output_text.done","text":"Done"}',
    ),
    true,
  );
  assert.equal(
    containsReadableAnswerEvent(
      'data: {"type":"response.output_text.delta","delta":""}',
    ),
    false,
  );
  assert.equal(
    containsReadableAnswerEvent(
      'data: {"type":"response.output_text.delta","delta":"  \\n"}',
    ),
    false,
  );
});

test("recognizes a readable event split across network chunks", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode('data: {"type":"response.output_text.del'),
      );
      controller.enqueue(
        encoder.encode('ta","delta":"First"}\n\n'),
      );
      controller.close();
    },
  });

  const result = await waitForFirstReadableAnswer(
    stream.getReader(),
    Date.now() + 100,
  );
  assert.equal(result.kind, "readable");
  assert.equal(result.buffered.length, 2);
});

test("deadline helper distinguishes completion, rejection, and timeout", async () => {
  const completed = await settleBeforeDeadline(
    Promise.resolve("ok"),
    Date.now() + 100,
  );
  assert.deepEqual(completed, { kind: "settled", value: "ok" });

  const rejected = await settleBeforeDeadline(
    Promise.reject(new Error("no")),
    Date.now() + 100,
  );
  assert.equal(rejected.kind, "rejected");

  const timedOut = await settleBeforeDeadline(
    new Promise(() => {}),
    Date.now() + 10,
  );
  assert.deepEqual(timedOut, { kind: "timeout" });
});

test("buffers the SSE preamble until the first readable token", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode('data: {"type":"response.created"}\n\n'),
      );
      controller.enqueue(
        encoder.encode(
          'data: {"type":"response.output_text.delta","delta":"First"}\n\n',
        ),
      );
      controller.close();
    },
  });
  const reader = stream.getReader();
  const result = await waitForFirstReadableAnswer(
    reader,
    Date.now() + 100,
  );

  assert.equal(result.kind, "readable");
  assert.equal(result.buffered.length, 2);
  const text = new TextDecoder().decode(
    Buffer.concat(result.buffered.map((chunk) => Buffer.from(chunk))),
  );
  assert.match(text, /response\.created/);
  assert.match(text, /response\.output_text\.delta/);
});

test("returns timeout without releasing a non-readable preamble", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('data: {"type":"response.created"}\n\n'),
      );
    },
  });
  const reader = stream.getReader();
  const result = await waitForFirstReadableAnswer(
    reader,
    Date.now() + 10,
  );
  await reader.cancel();

  assert.equal(result.kind, "timeout");
  assert.equal(result.buffered.length, 1);
});

test("returns ended for an empty completed stream", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
  const result = await waitForFirstReadableAnswer(
    stream.getReader(),
    Date.now() + 100,
  );
  assert.deepEqual(result, { kind: "ended", buffered: [] });
});

test("cancels the slow primary before starting one fallback", async () => {
  const encoder = new TextEncoder();
  let primaryAborted = false;
  let fallbackStarts = 0;
  const primary = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          'data: {"type":"response.created","response":{"model":"primary"}}\n\n',
        ),
      );
    },
  });
  const fallback = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          'data: {"type":"response.created","response":{"model":"fallback"}}\n\n',
        ),
      );
      controller.enqueue(
        encoder.encode(
          'data: {"type":"response.output_text.delta","delta":"Ready"}\n\n',
        ),
      );
      controller.close();
    },
  });

  const output = await readAll(createSequentialAnswerStream({
    primary: {
      body: primary,
      abort() {
        primaryAborted = true;
      },
    },
    deadlineAt: Date.now() + 10,
    fallback: async () => {
      assert.equal(primaryAborted, true);
      fallbackStarts += 1;
      return { body: fallback, abort() {} };
    },
    errorChunk: () => encoder.encode("error"),
  }));

  assert.equal(fallbackStarts, 1);
  assert.doesNotMatch(output, /primary/);
  assert.match(output, /fallback/);
  assert.match(output, /Ready/);
});

test("keeps a timely primary and never creates the fallback", async () => {
  const encoder = new TextEncoder();
  let fallbackStarts = 0;
  const primary = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode('data: {"type":"response.created"}\n\n'),
      );
      controller.enqueue(
        encoder.encode(
          'data: {"type":"response.output_text.delta","delta":"Primary"}\n\n',
        ),
      );
      controller.close();
    },
  });

  const output = await readAll(createSequentialAnswerStream({
    primary: { body: primary, abort() {} },
    deadlineAt: Date.now() + 100,
    fallback: async () => {
      fallbackStarts += 1;
      throw new Error("must not run");
    },
    errorChunk: () => encoder.encode("error"),
  }));

  assert.equal(fallbackStarts, 0);
  assert.match(output, /Primary/);
  assert.doesNotMatch(output, /error/);
});

test("downstream cancellation aborts the active source without fallback", async () => {
  let aborts = 0;
  let cancellationHooks = 0;
  let fallbacks = 0;
  const primary = new ReadableStream({ start() {} });
  const guarded = createSequentialAnswerStream({
    primary: {
      body: primary,
      abort() {
        aborts += 1;
      },
    },
    deadlineAt: Date.now() + 1_000,
    fallback: async () => {
      fallbacks += 1;
      return { body: new ReadableStream(), abort() {} };
    },
    errorChunk: () => new Uint8Array(),
    onCancel() {
      cancellationHooks += 1;
    },
  });

  await guarded.cancel("newer-question");
  assert.equal(aborts, 1);
  assert.equal(cancellationHooks, 1);
  assert.equal(fallbacks, 0);
});
