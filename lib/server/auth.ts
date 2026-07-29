import {
  ServiceError,
  readJSON,
  requireRuntimeValue,
} from "./runtime";
import { enforcePublicRateLimit } from "./rate-limit";

export interface CueAsideUser {
  id: string;
  email: string | null;
}

type OAuthProvider = "google" | "apple";

export async function createOAuthURL(request: Request): Promise<Response> {
  const body = await readJSON<{ provider?: string }>(request, 8_000);
  const provider = body.provider?.trim().toLowerCase() as OAuthProvider;
  if (provider !== "google" && provider !== "apple") {
    throw new ServiceError(
      "Choose Google or Apple to continue.",
      400,
      "invalid_provider",
    );
  }

  const enabled =
    provider === "google"
      ? process.env.AUTH_GOOGLE_ENABLED === "true"
      : process.env.AUTH_APPLE_ENABLED === "true";
  if (!enabled) {
    throw new ServiceError(
      `${provider === "google" ? "Google" : "Apple"} sign-in is being configured. Use email for now.`,
      503,
      "provider_not_configured",
    );
  }

  await enforcePublicRateLimit({
    request,
    scope: "oauth-start",
    maximum: 30,
    windowSeconds: 15 * 60,
  });

  const base = requireRuntimeValue(
    "SUPABASE_URL",
    "Sign in is not configured yet.",
  ).replace(/\/+$/, "");
  const url = new URL(`${base}/auth/v1/authorize`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", "cueaside://auth/callback");

  return Response.json(
    { url: url.toString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function supabaseHeaders(accessToken?: string): HeadersInit {
  const apiKey = requireRuntimeValue(
    "SUPABASE_ANON_KEY",
    "Sign in is not configured yet.",
  );
  return {
    apikey: apiKey,
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

function supabaseURL(path: string): string {
  const base = requireRuntimeValue(
    "SUPABASE_URL",
    "Sign in is not configured yet.",
  ).replace(/\/+$/, "");
  return `${base}${path}`;
}

async function supabaseJSON(
  path: string,
  init: RequestInit,
  accessToken?: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(supabaseURL(path), {
    ...init,
    headers: {
      ...supabaseHeaders(accessToken),
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      (typeof payload.msg === "string" && payload.msg) ||
      (typeof payload.error_description === "string" &&
        payload.error_description) ||
      (typeof payload.message === "string" && payload.message) ||
      "Sign in failed.";
    throw new ServiceError(
      message,
      response.status === 429 ? 429 : 401,
      "auth_failed",
    );
  }

  return payload;
}

export async function requestEmailCode(request: Request): Promise<Response> {
  const body = await readJSON<{ email?: string }>(request, 8_000);
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ServiceError(
      "Enter a valid email address.",
      400,
      "invalid_email",
    );
  }
  await enforcePublicRateLimit({
    request,
    scope: "auth-code",
    subject: email,
    maximum: 5,
    windowSeconds: 15 * 60,
  });

  await supabaseJSON("/auth/v1/otp", {
    method: "POST",
    body: JSON.stringify({ email, create_user: true }),
  });

  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function verifyEmailCode(request: Request): Promise<Response> {
  const body = await readJSON<{ email?: string; token?: string }>(
    request,
    8_000,
  );
  const email = body.email?.trim().toLowerCase() ?? "";
  const token = body.token?.trim() ?? "";
  if (!email || !/^\d{6,8}$/.test(token)) {
    throw new ServiceError(
      "Enter the code from your email.",
      400,
      "invalid_code",
    );
  }
  await enforcePublicRateLimit({
    request,
    scope: "auth-verify",
    subject: email,
    maximum: 10,
    windowSeconds: 15 * 60,
  });

  const result = await supabaseJSON("/auth/v1/verify", {
    method: "POST",
    body: JSON.stringify({ type: "email", email, token }),
  });
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function refreshSession(request: Request): Promise<Response> {
  const body = await readJSON<{ refresh_token?: string }>(request, 16_000);
  const refreshToken = body.refresh_token?.trim() ?? "";
  if (!refreshToken) {
    throw new ServiceError(
      "Your session has expired. Sign in again.",
      401,
      "missing_refresh_token",
    );
  }

  const result = await supabaseJSON(
    "/auth/v1/token?grant_type=refresh_token",
    {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function requireUser(request: Request): Promise<CueAsideUser> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    throw new ServiceError("Sign in to continue.", 401, "sign_in_required");
  }

  const result = await supabaseJSON(
    "/auth/v1/user",
    { method: "GET" },
    token,
  );
  const id = typeof result.id === "string" ? result.id : "";
  if (!id) {
    throw new ServiceError(
      "Your session has expired. Sign in again.",
      401,
      "invalid_session",
    );
  }

  return {
    id,
    email: typeof result.email === "string" ? result.email : null,
  };
}
