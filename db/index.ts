import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  const runtime = env as unknown as { DB?: D1Database };
  if (!runtime.DB) {
    throw new Error("CueAside billing storage is not configured.");
  }
  return drizzle(runtime.DB, { schema });
}
