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
  const forwarded = input.request.headers.get("cf-connecting-ip") ??
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
