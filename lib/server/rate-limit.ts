import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rateLimits } from "@/db/schema";
import {
  ServiceError,
  pseudonymousIdentifier,
} from "./runtime";

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
  const now = Math.floor(Date.now() / 1_000);
  const db = getDb();
  const [current] = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .limit(1);

  if (
    !current ||
    now - current.windowStartedAt >= input.windowSeconds
  ) {
    await db
      .insert(rateLimits)
      .values({
        key,
        windowStartedAt: now,
        requestCount: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          windowStartedAt: now,
          requestCount: 1,
          updatedAt: now,
        },
      });
    return;
  }

  if (current.requestCount >= input.maximum) {
    throw new ServiceError(
      "Too many attempts. Wait a few minutes and try again.",
      429,
      "rate_limited",
    );
  }

  await db
    .update(rateLimits)
    .set({
      requestCount: current.requestCount + 1,
      updatedAt: now,
    })
    .where(eq(rateLimits.key, key));
}
