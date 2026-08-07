#!/usr/bin/env node
/*
 * Verify that the keys in an env file are real, live and consistent —
 * not placeholders that merely exist. Run it yourself; keys never leave
 * your machine except to the service they belong to.
 *
 * Vercel Sensitive values cannot be read back after creation, so Production
 * must be verified from the authenticated /internal/ Console. This script is
 * only a local fallback when an operator already has directly supplied process
 * variables or a private env file:
 *
 *   node scripts/verify-production-keys.mjs .env.production.local
 *
 * Exit code 0 = every required check passed.
 */

import { readFileSync } from "node:fs";

const file = process.argv[2];
const env = file ? {} : process.env;

if (file) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match) {
      env[match[1]] = match[2];
    }
  }
}

const results = [];
let failed = false;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) {
    failed = true;
  }
}

async function call(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    return response;
  } catch (error) {
    return { ok: false, status: error.name ?? "fetch_failed", json: async () => null };
  }
}

const supabase = (env.SUPABASE_URL ?? "").replace(/\/+$/, "");

// --- Supabase -------------------------------------------------------------

{
  const response = await call(`${supabase}/auth/v1/health`, {
    headers: { apikey: env.SUPABASE_ANON_KEY ?? "" },
  });
  record("Supabase URL + anon key (auth health)", response.ok === true, `status ${response.status}`);
}

{
  const response = await call(
    `${supabase}/rest/v1/billing_accounts?select=user_id&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      },
    },
  );
  record(
    "Supabase service-role key (reads billing_accounts)",
    response.ok === true,
    `status ${response.status}`,
  );
}

{
  const response = await call(`${supabase}/auth/v1/settings`, {
    headers: { apikey: env.SUPABASE_ANON_KEY ?? "" },
  });
  if (response.ok) {
    const settings = await response.json();
    const google = settings?.external?.google === true;
    record(
      "Supabase Google provider enabled",
      google,
      google ? "" : "external.google is false in auth settings",
    );
  } else {
    record("Supabase auth settings readable", false, `status ${response.status}`);
  }
}

// --- Stripe ---------------------------------------------------------------

{
  const key = env.STRIPE_SECRET_KEY ?? "";
  record(
    "Stripe key is a LIVE secret key",
    key.startsWith("sk_live_") || key.startsWith("rk_live_"),
    key.startsWith("sk_test_") ? "this is a TEST key" : key ? "unrecognized format" : "missing",
  );

  const response = await call(
    `https://api.stripe.com/v1/prices/${encodeURIComponent(env.STRIPE_PRICE_ID ?? "")}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (response.ok === true) {
    const price = await response.json();
    record(
      "Stripe price exists and is a monthly recurring price",
      price.recurring?.interval === "month" && price.active === true,
      `livemode=${price.livemode} interval=${price.recurring?.interval} active=${price.active}`,
    );
  } else {
    record("Stripe secret key + price id", false, `status ${response.status}`);
  }

  const hooks = await call(
    "https://api.stripe.com/v1/webhook_endpoints?limit=20",
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (hooks.ok === true) {
    const list = await hooks.json();
    const target = (list.data ?? []).find((hook) =>
      hook.url?.includes("cueaside.com/api/billing/webhook"),
    );
    record(
      "Stripe webhook registered for cueaside.com/api/billing/webhook",
      Boolean(target && target.status === "enabled"),
      target ? `status=${target.status}` : "no matching endpoint",
    );
  } else {
    record("Stripe webhook endpoints listable", false, `status ${hooks.status}`);
  }

  record(
    "Stripe webhook secret shape",
    (env.STRIPE_WEBHOOK_SECRET ?? "").startsWith("whsec_"),
    "cannot be verified remotely — confirm it matches the endpoint above in the Stripe dashboard",
  );
}

// --- OpenAI ----------------------------------------------------------------

{
  const response = await call("https://api.openai.com/v1/models?limit=1", {
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY ?? ""}` },
  });
  record("OpenAI API key", response.ok === true, `status ${response.status}`);
}

// --- Deepgram --------------------------------------------------------------

{
  const response = await call("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: {
      Authorization: `Token ${env.DEEPGRAM_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  record(
    "Deepgram API key can grant temporary tokens",
    response.ok === true,
    `status ${response.status}`,
  );
}

// --- Report ----------------------------------------------------------------

console.log("");
for (const { name, ok, detail } of results) {
  console.log(`${ok ? "  ✅" : "  ❌"} ${name}${detail ? `  (${detail})` : ""}`);
}
console.log("");
console.log(failed ? "Some checks FAILED — fix before launch." : "All checks passed.");
process.exit(failed ? 1 : 0);
