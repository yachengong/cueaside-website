import { observeExternalCall } from "@/lib/server/observability";
import {
  publicSiteURL,
  runtime,
  type CueAsideRuntime,
} from "@/lib/server/runtime";

export type CredentialShape = { ok: boolean; hint?: string };

export type ProviderProbe = {
  ok: boolean;
  status: number | string;
};

export type StripeProbe = ProviderProbe & {
  active?: boolean;
  interval?: string;
  livemode?: boolean;
};

export type StripeWebhookProbe = ProviderProbe & {
  configured?: boolean;
};

export type LiveProviderHealth = {
  checkedAt: string;
  supabaseAuth: ProviderProbe;
  supabaseAdmin: ProviderProbe;
  stripe: StripeProbe;
  stripeWebhook: StripeWebhookProbe;
  openai: ProviderProbe;
  deepgram: ProviderProbe;
};

function shaped(
  value: string | undefined,
  test: (value: string) => boolean,
  hint: string,
): CredentialShape {
  if (!value || !value.trim()) {
    return { ok: false, hint: "missing" };
  }
  return test(value.trim()) ? { ok: true } : { ok: false, hint };
}

export function providerShapeChecks(env: CueAsideRuntime = runtime()) {
  return {
    SUPABASE_URL: shaped(
      env.SUPABASE_URL,
      (value) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(value),
      "expected https://<ref>.supabase.co",
    ),
    SUPABASE_ANON_KEY: shaped(
      env.SUPABASE_ANON_KEY,
      (value) => value.startsWith("eyJ") || value.startsWith("sb_publishable_"),
      "expected a JWT (eyJ…) or sb_publishable_… key",
    ),
    SUPABASE_SERVICE_ROLE_KEY: shaped(
      env.SUPABASE_SERVICE_ROLE_KEY,
      (value) => value.startsWith("eyJ") || value.startsWith("sb_secret_"),
      "expected a JWT (eyJ…) or sb_secret_… key",
    ),
    STRIPE_SECRET_KEY: shaped(
      env.STRIPE_SECRET_KEY,
      (value) => /^(sk|rk)_(live|test)_/.test(value),
      "expected sk_live_… / sk_test_…",
    ),
    STRIPE_WEBHOOK_SECRET: shaped(
      env.STRIPE_WEBHOOK_SECRET,
      (value) => value.startsWith("whsec_"),
      "expected whsec_…",
    ),
    STRIPE_PRICE_ID: shaped(
      env.STRIPE_PRICE_ID,
      (value) => value.startsWith("price_"),
      "expected price_…",
    ),
    OPENAI_API_KEY: shaped(
      env.OPENAI_API_KEY,
      (value) => value.startsWith("sk-"),
      "expected sk-…",
    ),
    DEEPGRAM_API_KEY: shaped(
      env.DEEPGRAM_API_KEY,
      (value) => value.length >= 24 && !/replace_me/i.test(value),
      "expected a Deepgram project API key",
    ),
  };
}

export function configuredServiceReadiness(
  env: CueAsideRuntime = runtime(),
  checks = providerShapeChecks(env),
) {
  return {
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
}

async function observedFetch(
  service: "openai" | "deepgram" | "supabase" | "stripe",
  url: string,
  init: RequestInit,
): Promise<Response> {
  return observeExternalCall(
    { service, operation: "provider_health" },
    () => fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    }),
  );
}

async function probe(
  service: "openai" | "deepgram" | "supabase" | "stripe",
  url: string,
  init: RequestInit,
): Promise<ProviderProbe> {
  try {
    const response = await observedFetch(service, url, init);
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof Error ? error.name : "fetch_failed",
    };
  }
}

function normalizedWebhookURL(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function liveProviderProbes(
  env: CueAsideRuntime = runtime(),
): Promise<LiveProviderHealth> {
  const supabaseBase = (env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const stripeKey = env.STRIPE_SECRET_KEY ?? "";
  const stripeHeaders = { Authorization: `Bearer ${stripeKey}` };

  const [supabaseAuth, supabaseAdmin, stripe, stripeWebhook, openai, deepgram] =
    await Promise.all([
      probe("supabase", `${supabaseBase}/auth/v1/health`, {
        headers: { apikey: env.SUPABASE_ANON_KEY ?? "" },
      }),
      probe(
        "supabase",
        `${supabaseBase}/rest/v1/billing_accounts?select=user_id&limit=1`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
          },
        },
      ),
      (async (): Promise<StripeProbe> => {
        try {
          const price = encodeURIComponent(env.STRIPE_PRICE_ID ?? "");
          const response = await observedFetch(
            "stripe",
            `https://api.stripe.com/v1/prices/${price}`,
            { headers: stripeHeaders },
          );
          const body = (await response.json().catch(() => null)) as {
            active?: boolean;
            livemode?: boolean;
            recurring?: { interval?: string };
          } | null;
          return {
            ok: response.ok,
            status: response.status,
            active: response.ok ? body?.active === true : undefined,
            interval: response.ok ? body?.recurring?.interval : undefined,
            livemode: response.ok ? body?.livemode === true : undefined,
          };
        } catch (error) {
          return {
            ok: false,
            status: error instanceof Error ? error.name : "fetch_failed",
          };
        }
      })(),
      (async (): Promise<StripeWebhookProbe> => {
        try {
          const response = await observedFetch(
            "stripe",
            "https://api.stripe.com/v1/webhook_endpoints?limit=100",
            { headers: stripeHeaders },
          );
          const body = (await response.json().catch(() => null)) as {
            data?: Array<{ status?: string; url?: string }>;
          } | null;
          const expected = `${publicSiteURL(env)}/api/billing/webhook`;
          const target = body?.data?.find(
            (item) => normalizedWebhookURL(item.url ?? "") === expected,
          );
          return {
            ok: response.ok && target?.status === "enabled",
            status: response.status,
            configured: target?.status === "enabled",
          };
        } catch (error) {
          return {
            ok: false,
            status: error instanceof Error ? error.name : "fetch_failed",
          };
        }
      })(),
      probe("openai", "https://api.openai.com/v1/models?limit=1", {
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY ?? ""}` },
      }),
      probe("deepgram", "https://api.deepgram.com/v1/auth/grant", {
        method: "POST",
        headers: {
          Authorization: `Token ${env.DEEPGRAM_API_KEY ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl_seconds: 60 }),
      }),
    ]);

  return {
    checkedAt: new Date().toISOString(),
    supabaseAuth,
    supabaseAdmin,
    stripe,
    stripeWebhook,
    openai,
    deepgram,
  };
}
