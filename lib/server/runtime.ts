export interface CueAsideRuntime {
  PUBLIC_SITE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AUTH_GOOGLE_ENABLED?: string;
  AUTH_APPLE_ENABLED?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  OPENAI_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
  SAFETY_ID_SECRET?: string;
  BILLING_BYPASS_USER_IDS?: string;
  CUEASIDE_ADMIN_USER_IDS?: string;
}

export function runtime(): CueAsideRuntime {
  return process.env as CueAsideRuntime;
}

export function requireRuntimeValue(
  key: keyof CueAsideRuntime,
  message = "This service is not configured yet.",
): string {
  const value = runtime()[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ServiceError(message, 503, "service_not_configured");
  }
  return value.trim();
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code = "internal_error",
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  const known =
    error instanceof ServiceError
      ? error
      : new ServiceError("Something went wrong. Please try again.");

  return Response.json(
    { error: { code: known.code, message: known.message } },
    {
      status: known.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function readJSON<T>(
  request: Request,
  maxBytes = 256_000,
): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) {
    throw new ServiceError("Request is too large.", 413, "request_too_large");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ServiceError("Request is too large.", 413, "request_too_large");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ServiceError("Request body must be valid JSON.", 400, "invalid_json");
  }
}

export function publicSiteURL(): string {
  return runtime().PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    "https://cueaside.com";
}

export async function pseudonymousIdentifier(value: string): Promise<string> {
  const secret = requireRuntimeValue(
    "SAFETY_ID_SECRET",
    "Server security is not configured yet.",
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
