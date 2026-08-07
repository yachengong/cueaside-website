import {
  ServiceError,
  pseudonymousIdentifier,
} from "./runtime";
import { consumeRateLimit } from "./supabase";

export async function enforcePublicRateLimit(input: {
  request: Request;
  scope: string;
  subject?: string;
  maximum: number;
  windowSeconds: number;
}): Promise<void> {
  // This service runs on Vercel. `cf-connecting-ip` is only trustworthy when
  // every request is guaranteed to have traversed Cloudflare; on a public
  // Vercel deployment a caller can supply it directly and rotate the value to
  // evade an IP limit. Prefer Vercel's platform-owned header instead.
  const forwarded = input.request.headers.get("x-vercel-forwarded-for") ??
    input.request.headers.get("x-real-ip") ??
    input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const rawKey = `${input.scope}:${forwarded}:${input.subject ?? ""}`;
  const key = `${input.scope}:${await pseudonymousIdentifier(rawKey)}`;
  const allowed = await consumeRateLimit({
    key,
    maximum: input.maximum,
    windowSeconds: input.windowSeconds,
  });
  if (!allowed) {
    throw new ServiceError(
      "Too many attempts. Wait a few minutes and try again.",
      429,
      "rate_limited",
    );
  }

}

/// Authenticated endpoints should be limited by the verified account, not a
/// caller-controlled network header. This also keeps the limit stable when a
/// laptop moves between Wi-Fi and a phone hotspot during a session.
export async function enforceAccountRateLimit(input: {
  scope: string;
  subject: string;
  maximum: number;
  windowSeconds: number;
}): Promise<void> {
  const rawKey = `${input.scope}:${input.subject}`;
  const key = `${input.scope}:${await pseudonymousIdentifier(rawKey)}`;
  const allowed = await consumeRateLimit({
    key,
    maximum: input.maximum,
    windowSeconds: input.windowSeconds,
  });
  if (!allowed) {
    throw new ServiceError(
      "Too many attempts. Wait a moment and try again.",
      429,
      "rate_limited",
    );
  }
}
