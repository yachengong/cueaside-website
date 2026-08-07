import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProductionBase,
  runProductionSmoke,
} from "../scripts/production-smoke.mjs";

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function successfulFetch() {
  return async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path === "/") {
      return new Response("<html><title>CueAside</title></html>", { status: 200 });
    }
    if (path === "/api/health") {
      return json(
        {
          ok: true,
          services: { auth: true, billing: true, ai: true, storage: true },
        },
        200,
      );
    }
    if (path === "/api/ai/answer" && init.method === "POST") {
      return json({ error: { code: "sign_in_required" } }, 401);
    }
    if (path === "/internal/") {
      return new Response(null, {
        status: 307,
        headers: { Location: "https://cueaside.com/internal/login/" },
      });
    }
    throw new Error(`Unexpected smoke-test path: ${path}`);
  };
}

test("accepts only a plain HTTPS production origin", () => {
  assert.equal(normalizeProductionBase("https://cueaside.com/"), "https://cueaside.com");
  assert.throws(() => normalizeProductionBase("http://cueaside.com"), /plain HTTPS/);
  assert.throws(() => normalizeProductionBase("https://user@cueaside.com"), /plain HTTPS/);
  assert.throws(() => normalizeProductionBase("https://cueaside.com/anything"), /plain HTTPS/);
  assert.throws(() => normalizeProductionBase("https://cueaside.com?token=x"), /plain HTTPS/);
});

test("verifies availability and both unauthenticated boundaries", async () => {
  const checks = await runProductionSmoke({
    fetchImpl: successfulFetch(),
    sleepImpl: async () => {},
  });

  assert.deepEqual(
    checks.map((check) => check.label),
    [
      "homepage",
      "public health",
      "AI authentication boundary",
      "Console authentication boundary",
    ],
  );
});

test("retries a transient health failure without weakening validation", async () => {
  const baseFetch = successfulFetch();
  let healthAttempts = 0;
  const fetchImpl = async (url, init) => {
    if (new URL(url).pathname === "/api/health" && healthAttempts++ === 0) {
      return json({ ok: false }, 503);
    }
    return baseFetch(url, init);
  };

  const checks = await runProductionSmoke({
    fetchImpl,
    sleepImpl: async () => {},
  });
  assert.equal(checks.find((check) => check.label === "public health")?.attempts, 2);
});

test("fails when an unsigned-beta path returns", async () => {
  const baseFetch = successfulFetch();
  const fetchImpl = async (url, init) => {
    if (new URL(url).pathname === "/") {
      return new Response("CueAside — Download CueAside beta", { status: 200 });
    }
    return baseFetch(url, init);
  };

  await assert.rejects(
    runProductionSmoke({ fetchImpl, sleepImpl: async () => {} }),
    /retired unsigned-beta path/,
  );
});
