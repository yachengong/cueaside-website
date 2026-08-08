import { runtime } from "@/lib/server/runtime";
import {
  configuredServiceReadiness,
  liveProviderProbes,
  providerShapeChecks,
} from "@/lib/server/provider-health";

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

export async function GET(request: Request) {
  const startedAt = Date.now();
  const env = runtime();
  const checks = providerShapeChecks(env);
  const services = configuredServiceReadiness(env, checks);

  const url = new URL(request.url);
  const wantsLive = url.searchParams.get("probe") === "live";
  const probeToken = process.env.HEALTH_PROBE_TOKEN;
  let live: Awaited<ReturnType<typeof liveProviderProbes>> | undefined;

  if (wantsLive) {
    if (!probeToken || request.headers.get("x-health-token") !== probeToken) {
      return Response.json(
        { ok: false, error: { code: "probe_forbidden" } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    live = await liveProviderProbes(env);
  }

  // Optional sign-in providers don't gate overall health.
  const required = [services.auth, services.billing, services.ai, services.storage];

  const ok = required.every(Boolean);
  console.log(JSON.stringify({
    level: "info",
    event: "health_check",
    requestId: request.headers.get("x-vercel-id"),
    live: wantsLive,
    ok,
    durationMs: Date.now() - startedAt,
  }));

  return Response.json(
    {
      ok,
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
