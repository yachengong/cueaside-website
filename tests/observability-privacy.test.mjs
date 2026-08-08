import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverFiles = [
  "lib/server/openai.ts",
  "lib/server/deepgram.ts",
  "lib/server/provider-health.ts",
  "lib/server/supabase.ts",
];

test("provider logs never include upstream response bodies", async () => {
  for (const file of serverFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /console\.(?:error|warn|log)\s*\([^)]*(?:payload|detail|responseBody|spokenReply|suggestedAnswer|input)/s,
      `${file} logs user or provider payload data`,
    );
  }
});

test("every provider fetch uses the safe external-call observer", async () => {
  for (const file of serverFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /await\s+fetch\s*\(/, `${file} bypasses telemetry`);
    assert.match(source, /observeExternalCall\s*\(/);
  }
});

test("external-call telemetry has a closed content-free schema", async () => {
  const source = await readFile(
    new URL("../lib/server/observability.ts", import.meta.url),
    "utf8",
  );
  for (const field of [
    "event",
    "service",
    "operation",
    "status",
    "durationMs",
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
  for (const forbidden of [
    "prompt",
    "transcript",
    "answer",
    "email",
    "userId",
    "requestBody",
    "responseBody",
    "errorMessage",
  ]) {
    assert.doesNotMatch(
      source.replace(/\/\*[\s\S]*?\*\//g, ""),
      new RegExp(`\\b${forbidden}\\s*:`, "i"),
    );
  }
});

test("answer metrics contain timing, usage, and cost but no conversation text", async () => {
  const source = await readFile(
    new URL("../lib/server/answer-metrics.ts", import.meta.url),
    "utf8",
  );
  for (const field of [
    "model",
    "depth",
    "reasoningEffort",
    "serviceTier",
    "firstReadableMs",
    "durationMs",
    "inputTokens",
    "cachedInputTokens",
    "outputTokens",
    "reasoningTokens",
    "estimatedCostMicroUSD",
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
  assert.match(source, /Delta text is checked only for non-whitespace/);
  assert.doesNotMatch(
    source,
    /console\.(?:error|warn|log)\s*\([^)]*(?:delta|text|prompt|transcript|userId)/s,
  );
});

test("transcription diagnostics accept only closed signal and result fields", async () => {
  const source = await readFile(
    new URL("../lib/server/transcription-diagnostics.ts", import.meta.url),
    "utf8",
  );
  for (const field of [
    "streamRole",
    "captureSource",
    "delivery",
    "model",
    "language",
    "disposition",
    "durationMilliseconds",
    "voicedMilliseconds",
    "peakRMSPartsPerMillion",
    "silenceThresholdPartsPerMillion",
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(
    source,
    /\b(audio|transcript|question|answer|prompt|context|sessionId|userId|filename)\s*:/i,
  );
  assert.match(source, /body\.schemaVersion !== 1/);
  assert.match(source, /Object\.keys\(value\)/);
  assert.match(source, /!FIELDS\.has\(field\)/);
  assert.match(source, /scope: "transcription-diagnostic"/);
});

test("Sentry strips request and conversation context before sending", async () => {
  const source = await readFile(
    new URL("../instrumentation.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /beforeSend:\s*scrubConversationData/);
  assert.match(source, /beforeSendTransaction:\s*scrubConversationData/);
  assert.match(source, /event\.request\s*=\s*method\s*\?/);
  assert.match(source, /event\.breadcrumbs\s*=\s*undefined/);
  assert.match(source, /event\.extra\s*=\s*undefined/);
  assert.match(source, /event\.user\s*=\s*undefined/);
});
