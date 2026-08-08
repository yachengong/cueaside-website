import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "https://cueaside.com";
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const REQUIRED_SERVICES = ["auth", "billing", "ai", "storage"];
const REQUIRED_LIVE_PROVIDERS = [
  "supabaseAuth",
  "supabaseAdmin",
  "stripe",
  "stripeWebhook",
  "openai",
  "deepgram",
];

export function normalizeProductionBase(value) {
  const url = new URL(value || DEFAULT_BASE_URL);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Production smoke URL must be a plain HTTPS origin.");
  }
  return url.origin;
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function requestWithRetry({
  fetchImpl,
  url,
  init = {},
  expectedStatuses,
  label,
  attempts = 3,
  sleepImpl = defaultSleep,
}) {
  let lastStatus = 0;
  let lastFailure = "network_error";
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    attemptsMade = attempt;
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const durationMs = Date.now() - startedAt;
      lastStatus = response.status;

      if (expectedStatuses.includes(response.status)) {
        return { response, durationMs, attempts: attempt };
      }

      lastFailure = `status_${response.status}`;
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) {
        break;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.name : "network_error";
      if (attempt === attempts) break;
    }

    await sleepImpl(250 * 2 ** (attempt - 1));
  }

  const status = lastStatus > 0 ? `HTTP ${lastStatus}` : lastFailure;
  throw new Error(
    `${label} failed after ${attemptsMade} attempt${attemptsMade === 1 ? "" : "s"}`
      + ` (${status}).`,
  );
}

function checkLocation(response, expectedPath) {
  const location = response.headers.get("location");
  if (!location) return false;
  try {
    return new URL(location, response.url || DEFAULT_BASE_URL).pathname === expectedPath;
  } catch {
    return false;
  }
}

export async function runProductionSmoke({
  baseURL = DEFAULT_BASE_URL,
  healthProbeToken = "",
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
} = {}) {
  const base = normalizeProductionBase(baseURL);
  const checks = [];

  const homepage = await requestWithRetry({
    fetchImpl,
    url: `${base}/`,
    expectedStatuses: [200],
    label: "homepage",
    sleepImpl,
  });
  const homepageText = await homepage.response.text();
  if (!homepageText.includes("CueAside")) {
    throw new Error("Homepage returned 200 without the CueAside product marker.");
  }
  if (/Download CueAside beta|Open Anyway/i.test(homepageText)) {
    throw new Error("Homepage exposed the retired unsigned-beta path.");
  }
  checks.push({
    label: "homepage",
    status: homepage.response.status,
    durationMs: homepage.durationMs,
    attempts: homepage.attempts,
  });

  const health = await requestWithRetry({
    fetchImpl,
    url: `${base}/api/health`,
    expectedStatuses: [200],
    label: "public health",
    sleepImpl,
  });
  const healthBody = await health.response.json().catch(() => null);
  if (
    !healthBody ||
    healthBody.ok !== true ||
    REQUIRED_SERVICES.some((service) => healthBody.services?.[service] !== true)
  ) {
    throw new Error("Public health returned an unhealthy required service.");
  }
  checks.push({
    label: "public health",
    status: health.response.status,
    durationMs: health.durationMs,
    attempts: health.attempts,
  });

  const authBoundary = await requestWithRetry({
    fetchImpl,
    url: `${base}/api/ai/answer`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    expectedStatuses: [401],
    label: "AI authentication boundary",
    sleepImpl,
  });
  const authBody = await authBoundary.response.json().catch(() => null);
  if (authBody?.error?.code !== "sign_in_required") {
    throw new Error("Unauthenticated AI request did not fail closed.");
  }
  checks.push({
    label: "AI authentication boundary",
    status: authBoundary.response.status,
    durationMs: authBoundary.durationMs,
    attempts: authBoundary.attempts,
  });

  const consoleBoundary = await requestWithRetry({
    fetchImpl,
    url: `${base}/internal/`,
    init: { redirect: "manual" },
    expectedStatuses: [302, 303, 307, 308],
    label: "Console authentication boundary",
    sleepImpl,
  });
  if (!checkLocation(consoleBoundary.response, "/internal/login/")) {
    throw new Error("Unauthenticated Console request did not redirect to login.");
  }
  checks.push({
    label: "Console authentication boundary",
    status: consoleBoundary.response.status,
    durationMs: consoleBoundary.durationMs,
    attempts: consoleBoundary.attempts,
  });

  const privateProbeToken = healthProbeToken.trim();
  if (privateProbeToken) {
    const providerHealth = await requestWithRetry({
      fetchImpl,
      url: `${base}/api/health?probe=live`,
      init: {
        headers: { "x-health-token": privateProbeToken },
      },
      expectedStatuses: [200],
      label: "live provider health",
      sleepImpl,
    });
    const providerBody = await providerHealth.response.json().catch(() => null);
    const unhealthyProviders = REQUIRED_LIVE_PROVIDERS.filter(
      (provider) => providerBody?.live?.[provider]?.ok !== true,
    );

    if (providerBody?.ok !== true || unhealthyProviders.length > 0) {
      const suffix = unhealthyProviders.length
        ? `: ${unhealthyProviders.join(", ")}`
        : "";
      throw new Error(`Live provider health reported an unhealthy dependency${suffix}.`);
    }
    if (
      providerBody.live.stripe.active !== true ||
      providerBody.live.stripe.interval !== "month" ||
      providerBody.live.stripe.livemode !== true
    ) {
      throw new Error("Live provider health found a non-production Stripe Price.");
    }

    checks.push({
      label: "live provider health",
      status: providerHealth.response.status,
      durationMs: providerHealth.durationMs,
      attempts: providerHealth.attempts,
    });
  }

  return checks;
}

async function main() {
  const healthProbeToken = process.env.CUEASIDE_HEALTH_PROBE_TOKEN?.trim() ?? "";
  const checks = await runProductionSmoke({
    baseURL: process.env.CUEASIDE_PRODUCTION_URL || DEFAULT_BASE_URL,
    healthProbeToken,
  });
  for (const check of checks) {
    console.log(
      `[ok] ${check.label}: ${check.status} in ${check.durationMs} ms`
      + ` (${check.attempts} attempt${check.attempts === 1 ? "" : "s"})`,
    );
  }
  if (!healthProbeToken) {
    console.log(
      "[skip] live provider health: CUEASIDE_HEALTH_PROBE_TOKEN is not configured",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Production smoke failed.");
    process.exitCode = 1;
  });
}
