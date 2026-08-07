import { CueAsideUser } from "./auth";
import { recordUsage, requireEntitlement } from "./billing";
import { enforceAccountRateLimit } from "./rate-limit";
import { requireRuntimeValue, ServiceError } from "./runtime";

/**
 * Issues a short-lived, usage-only Deepgram JWT for a direct low-latency
 * WebSocket. The provider API key never leaves the server. Deepgram only
 * requires the JWT to be valid while the socket handshake is established.
 */
export async function createDeepgramToken(
  _request: Request,
  user: CueAsideUser,
): Promise<Response> {
  const entitlement = await requireEntitlement(user.id);
  await enforceAccountRateLimit({
    scope: "deepgram-token",
    subject: user.id,
    maximum: 40,
    windowSeconds: 5 * 60,
  });
  if (!entitlement.bypass) {
    await recordUsage(user.id, "realtimeTokens", entitlement.plan);
  }

  const upstream = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: {
      Authorization: `Token ${requireRuntimeValue(
        "DEEPGRAM_API_KEY",
        "Live transcription is not configured yet.",
      )}`,
      "Content-Type": "application/json",
    },
    // The macOS client caches this usage-only JWT for four minutes. Deepgram
    // requires it only during each WebSocket handshake, so one metered grant
    // can safely cover several short speech segments without exposing the
    // long-lived provider key.
    body: JSON.stringify({ ttl_seconds: 5 * 60 }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await upstream.text();
  if (!upstream.ok) {
    console.error("Deepgram token error", upstream.status, payload.slice(0, 500));
    throw new ServiceError(
      "Live transcription is temporarily unavailable.",
      upstream.status === 429 ? 429 : 502,
      "transcription_upstream_error",
    );
  }

  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
