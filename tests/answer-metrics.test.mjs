import assert from "node:assert/strict";
import test from "node:test";

import {
  completedNonStreamingAnswerMetric,
  estimateAnswerCostMicroUSD,
  failedAnswerMetric,
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

test("records a bounded content-free metric for upstream failures", () => {
  const metric = failedAnswerMetric({
    model: "unexpected-model",
    depth: "unexpected-depth",
    reasoningEffort: "high",
    serviceTier: "priority",
    httpStatus: 900,
    startedAt: Date.now() - 50,
  });

  assert.deepEqual(metric, {
    event: "answer_metric",
    operation: "answer",
    model: "gpt-5.6-terra",
    depth: "balanced",
    reasoningEffort: "none",
    serviceTier: "fast",
    status: "failed",
    httpStatus: 599,
    firstReadableMs: null,
    durationMs: metric.durationMs,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostMicroUSD: 0,
    pricingVersion: "2026-07-30",
  });
  assert.ok(metric.durationMs >= 0 && metric.durationMs <= 300_000);
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
    operation: "answer",
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

test("records operation-aware non-streaming metrics without retaining output", () => {
  const metric = completedNonStreamingAnswerMetric({
    operation: "reply_check",
    model: "gpt-5.6-luna",
    depth: "instinct",
    reasoningEffort: "none",
    serviceTier: null,
    httpStatus: 200,
    startedAt: Date.now() - 12,
  }, {
    model: "gpt-5.6-luna",
    service_tier: "standard",
    output: [{ content: [{ text: "private spoken reply analysis" }] }],
    usage: {
      input_tokens: 90,
      output_tokens: 10,
      input_tokens_details: { cached_tokens: 20 },
      output_tokens_details: { reasoning_tokens: 2 },
    },
  });

  assert.equal(metric.operation, "reply_check");
  assert.equal(metric.inputTokens, 90);
  assert.equal(metric.cachedInputTokens, 20);
  assert.equal(metric.outputTokens, 10);
  assert.equal(metric.reasoningTokens, 2);
  assert.doesNotMatch(JSON.stringify(metric), /private|spoken|analysis/);
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
    httpStatus: 900,
    startedAt: Date.now(),
  });

  const reader = observed.body.getReader();
  await reader.read();
  await reader.cancel("newer question");
  const metric = await observed.completion;
  assert.equal(upstreamCancelled, true);
  assert.equal(metric.status, "cancelled");
  assert.equal(metric.httpStatus, 599);
  assert.equal(metric.firstReadableMs, null);
});
