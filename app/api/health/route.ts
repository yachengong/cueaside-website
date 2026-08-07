import { runtime } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

/*
 * Two depths of health:
 *
 * GET /api/health
 *   Fast and public. Reports whether each service is configured AND whether
 *   the configured value even looks like a real credential (prefix/shape),
 *   so a placeholder pasted into Vercel no longer shows green. No external
 *   calls, no secrets echoed.
 *
 * GET /api/health?probe=live  (header: x-health-token: $HEALTH_PROBE_TOKEN)
 *   Actually calls Supabase, Stripe, OpenAI and Deepgram with the configured
 *   keys and reports per-service reachability, plus whether Stripe is in live
 *   mode.
 *   Token-gated so the public endpoint can't be used to make us hammer
 *   upstream APIs.
 */

type Shape = { ok: boolean; hint?: string };

function shaped(
  value: string | undefined,
  test: (v: string) => boolean,
  hint: string,
): Shape {
  if (!value || !value.trim()) {
    return { ok: false, hint: "missing" };
  }
  return test(value.trim()) ? { ok: true } : { ok: false, hint };
}

function shapeChecks(env: ReturnType<typeof runtime>) {
  return {
    SUPABASE_URL: shaped(
      env.SUPABASE_URL,
      (v) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v),
      "expected https://<ref>.supabase.co",
    ),
    SUPABASE_ANON_KEY: shaped(
      env.SUPABASE_ANON_KEY,
      (v) => v.startsWith("eyJ") || v.startsWith("sb_publishable_"),
      "expected a JWT (eyJ…) or sb_publishable_… key",
    ),
    SUPABASE_SERVICE_ROLE_KEY: shaped(
      env.SUPABASE_SERVICE_ROLE_KEY,
      (v) => v.startsWith("eyJ") || v.startsWith("sb_secret_"),
      "expected a JWT (eyJ…) or sb_secret_… key",
    ),
    STRIPE_SECRET_KEY: shaped(
      env.STRIPE_SECRET_KEY,
      (v) => /^(sk|rk)_(live|test)_/.test(v),
      "expected sk_live_… / sk_test_…",
    ),
    STRIPE_WEBHOOK_SECRET: shaped(
      env.STRIPE_WEBHOOK_SECRET,
      (v) => v.startsWith("whsec_"),
      "expected whsec_…",
    ),
    STRIPE_PRICE_ID: shaped(
      env.STRIPE_PRICE_ID,
      (v) => v.startsWith("price_"),
      "expected price_…",
    ),
    OPENAI_API_KEY: shaped(
      env.OPENAI_API_KEY,
      (v) => v.startsWith("sk-"),
      "expected sk-…",
    ),
    DEEPGRAM_API_KEY: shaped(
      env.DEEPGRAM_API_KEY,
      (v) => v.length >= 24 && !/replace_me/i.test(v),
      "expected a Deepgram project API key",
    ),
  };
}

async function probe(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number | string }> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof Error ? error.name : "fetch_failed",
    };
  }
}

async function liveProbes(env: ReturnType<typeof runtime>) {
  const supabaseBase = (env.SUPABASE_URL ?? "").replace(/\/+$/, "");

  const [supabaseAuth, supabaseAdmin, stripe, openai, deepgram] = await Promise.all([
    probe(`${supabaseBase}/auth/v1/health`, {
      headers: { apikey: env.SUPABASE_ANON_KEY ?? "" },
    }),
    probe(`${supabaseBase}/rest/v1/billing_accounts?select=user_id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      },
    }),
    (async () => {
      const price = encodeURIComponent(env.STRIPE_PRICE_ID ?? "");
      try {
        const response = await fetch(
          `https://api.stripe.com/v1/prices/${price}`,
          {
            headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY ?? ""}` },
            cache: "no-store",
            signal: AbortSignal.timeout(6_000),
          },
        );
        const body = (await response.json().catch(() => null)) as {
          livemode?: boolean;
        } | null;
        return {
          ok: response.ok,
          status: response.status as number | string,
          livemode: response.ok ? Boolean(body?.livemode) : undefined,
        };
      } catch (error) {
        return {
          ok: false,
          status: (error instanceof Error
            ? error.name
            : "fetch_failed") as number | string,
          livemode: undefined as boolean | undefined,
        };
      }
    })(),
    probe("https://api.openai.com/v1/models?limit=1", {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY ?? ""}` },
    }),
    probe("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    }),
  ]);

  return { supabaseAuth, supabaseAdmin, stripe, openai, deepgram };
}

export async function GET(request: Request) {
  const env = runtime();
  const checks = shapeChecks(env);

  const services = {
    auth: checks.SUPABASE_URL.ok && checks.SUPABASE_ANON_KEY.ok,
    googleSignIn: env.AUTH_GOOGLE_ENABLED === "true",
    appleSignIn: env.AUTH_APPLE_ENABLED === "true",
    billing:
      checks.STRIPE_SECRET_KEY.ok &&
      checks.STRIPE_WEBHOOK_SECRET.ok &&
      checks.STRIPE_PRICE_ID.ok,
    ai: checks.OPENAI_API_KEY.ok && checks.DEEPGRAM_API_KEY.ok,
    storage: checks.SUPABASE_URL.ok && checks.SUPABASE_SERVICE_ROLE_KEY.ok,
  };

  const url = new URL(request.url);
  const wantsLive = url.searchParams.get("probe") === "live";
  const probeToken = process.env.HEALTH_PROBE_TOKEN;
  let live: Awaited<ReturnType<typeof liveProbes>> | undefined;

  if (wantsLive) {
    if (!probeToken || request.headers.get("x-health-token") !== probeToken) {
      return Response.json(
        { ok: false, error: { code: "probe_forbidden" } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    live = await liveProbes(env);
  }

  // Optional sign-in providers don't gate overall health.
  const required = [services.auth, services.billing, services.ai, services.storage];

  return Response.json(
    {
      ok: required.every(Boolean),
      services,
      shape: Object.fromEntries(
        Object.entries(checks).map(([key, value]) => [
          key,
          value.ok ? "ok" : `bad: ${value.hint}`,
        ]),
      ),
      ...(live ? { live } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
