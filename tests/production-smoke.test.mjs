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

function successfulFetch({ onRequest = () => {} } = {}) {
  return async (url, init = {}) => {
    const parsedURL = new URL(url);
    const path = parsedURL.pathname;
    onRequest(parsedURL, init);
    if (path === "/") {
      return new Response("<html><title>CueAside</title></html>", { status: 200 });
    }
    if (path === "/api/health") {
      if (parsedURL.searchParams.get("probe") === "live") {
        return json(
          {
            ok: true,
            live: {
              checkedAt: "2026-08-07T12:00:00.000Z",
              supabaseAuth: { ok: true, status: 200 },
              supabaseAdmin: { ok: true, status: 200 },
              stripe: {
                ok: true,
                status: 200,
                active: true,
                interval: "month",
                livemode: true,
              },
              stripeWebhook: { ok: true, status: 200, configured: true },
              openai: { ok: true, status: 200 },
              deepgram: { ok: true, status: 200 },
            },
          },
          200,
        );
      }
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

test("skips the private provider probe when no token is configured", async () => {
  let privateProbeRequests = 0;
  const checks = await runProductionSmoke({
    fetchImpl: successfulFetch({
      onRequest(url) {
        if (url.searchParams.get("probe") === "live") privateProbeRequests += 1;
      },
    }),
    sleepImpl: async () => {},
  });

  assert.equal(privateProbeRequests, 0);
  assert.equal(checks.some((check) => check.label === "live provider health"), false);
});

test("verifies all live providers with the private token without exposing it", async () => {
  const token = "private-health-token-that-must-not-be-logged";
  let receivedHeader = "";
  const checks = await runProductionSmoke({
    healthProbeToken: token,
    fetchImpl: successfulFetch({
      onRequest(url, init) {
        if (url.searchParams.get("probe") === "live") {
          receivedHeader = new Headers(init.headers).get("x-health-token") ?? "";
        }
      },
    }),
    sleepImpl: async () => {},
  });

  assert.equal(receivedHeader, token);
  assert.equal(checks.at(-1)?.label, "live provider health");
  assert.equal(JSON.stringify(checks).includes(token), false);
});

test("fails when a live provider is unhealthy", async () => {
  const baseFetch = successfulFetch();
  const fetchImpl = async (url, init) => {
    const parsedURL = new URL(url);
    if (parsedURL.searchParams.get("probe") === "live") {
      const response = await baseFetch(url, init);
      const body = await response.json();
      body.live.deepgram = { ok: false, status: 503 };
      return json(body, 200);
    }
    return baseFetch(url, init);
  };

  await assert.rejects(
    runProductionSmoke({
      healthProbeToken: "private-health-token",
      fetchImpl,
      sleepImpl: async () => {},
    }),
    /unhealthy dependency: deepgram/,
  );
});

test("fails when Stripe is not ready for production billing", async () => {
  const baseFetch = successfulFetch();
  const fetchImpl = async (url, init) => {
    const parsedURL = new URL(url);
    if (parsedURL.searchParams.get("probe") === "live") {
      const response = await baseFetch(url, init);
      const body = await response.json();
      body.live.stripe.livemode = false;
      return json(body, 200);
    }
    return baseFetch(url, init);
  };

  await assert.rejects(
    runProductionSmoke({
      healthProbeToken: "private-health-token",
      fetchImpl,
      sleepImpl: async () => {},
    }),
    /non-production Stripe Price/,
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
