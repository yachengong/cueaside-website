import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_USAGE_LIMITS,
  usageDecision,
} from "../lib/server/usage-policy.ts";

test("Free and Pro expose the intended monthly boundaries", () => {
  assert.deepEqual(PLAN_USAGE_LIMITS.free, {
    answerRequests: 15,
    transcriptionRequests: 60,
    realtimeTokens: 15,
  });
  assert.deepEqual(PLAN_USAGE_LIMITS.pro, {
    answerRequests: 200,
    transcriptionRequests: 1_000,
    realtimeTokens: 300,
  });

  assert.deepEqual(usageDecision("free", "answerRequests"), {
    unlimited: false,
    limit: 15,
  });
  assert.deepEqual(usageDecision("pro", "transcriptionRequests"), {
    unlimited: false,
    limit: 1_000,
  });
});

test("owner/admin bypass is unlimited for every provider usage kind", () => {
  for (const kind of [
    "answerRequests",
    "transcriptionRequests",
    "realtimeTokens",
  ]) {
    assert.deepEqual(usageDecision("pro", kind, true), {
      unlimited: true,
      limit: null,
    });
  }
});

