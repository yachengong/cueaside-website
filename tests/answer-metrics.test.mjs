import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateAnswerCostMicroUSD,
  observeAnswerStream,
} from "../lib/server/answer-metrics.ts";

const encoder = new TextEncoder();

async function readAll(stream) {
  const chunks = [];
  const reader = stream.getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(Buffer.from(next.value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test("estimates standard, cached, and Fast answer cost in micro-USD", () => {
  assert.equal(estimateAnswerCostMicroUSD({
    model: "gpt-5.6-sol",
    serviceTier: null,
    inputTokens: 1_000,
    cachedInputTokens: 200,
    outputTokens: 100,
  }), 7_100);
  assert.equal(estimateAnswerCostMicroUSD({
    model: "gpt-5.6-terra",
    serviceTier: "fast",
    inputTokens: 1_000,
    cachedInputTokens: 0,
    outputTokens: 100,
  }), 6_400);
});

test("proxies split SSE bytes and retains only content-free metrics", async () => {
  const upstreamText = [
    'data: {"type":"response.created","response":{"model":"gpt-5.6-sol","service_tier":"priority"}}\n\n',
    'data: {"type":"response.output_text.del',
    'ta","delta":"First"}\n\n',
    'data: {"type":"response.output_text.delta","delta":" private answer"}\n\n',
    'data: {"type":"response.completed","response":{"model":"gpt-5.6-sol","service_tier":"priority","usage":{"input_tokens":1000,"input_tokens_details":{"cached_tokens":200},"output_tokens":100,"output_tokens_details":{"reasoning_tokens":40}}}}\n\n',
    "data: [DONE]\n\n",
  ];
  const upstream = new ReadableStream({
    start(controller) {
      for (const chunk of upstreamText) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const observed = observeAnswerStream(upstream, {
    model: "gpt-5.6-terra",
    depth: "thinking",
    reasoningEffort: "low",
    serviceTier: null,
    httpStatus: 200,
    startedAt: Date.now() - 20,
  });

  assert.equal(await readAll(observed.body), upstreamText.join(""));
  const metric = await observed.completion;
  assert.deepEqual(metric, {
    event: "answer_metric",
    model: "gpt-5.6-sol",
    depth: "thinking",
    reasoningEffort: "low",
    serviceTier: "fast",
    status: "completed",
    httpStatus: 200,
    firstReadableMs: metric.firstReadableMs,
    durationMs: metric.durationMs,
    inputTokens: 1_000,
    cachedInputTokens: 200,
    outputTokens: 100,
    reasoningTokens: 40,
    estimatedCostMicroUSD: 14_200,
    pricingVersion: "2026-07-30",
  });
  assert.ok(metric.firstReadableMs >= 0);
  assert.ok(metric.durationMs >= metric.firstReadableMs);
  assert.doesNotMatch(JSON.stringify(metric), /First|private answer/);
});

test("cancellation resolves a bounded metric instead of hanging after-work", async () => {
  let upstreamCancelled = false;
  const upstream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.created"}\n\n'));
    },
    cancel() {
      upstreamCancelled = true;
    },
  });
  const observed = observeAnswerStream(upstream, {
    model: "gpt-5.6-luna",
    depth: "instinct",
    reasoningEffort: "none",
    serviceTier: null,
    httpStatus: 200,
    startedAt: Date.now(),
  });

  const reader = observed.body.getReader();
  await reader.read();
  await reader.cancel("newer question");
  const metric = await observed.completion;
  assert.equal(upstreamCancelled, true);
  assert.equal(metric.status, "cancelled");
  assert.equal(metric.firstReadableMs, null);
});
