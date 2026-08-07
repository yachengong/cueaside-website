import {
  requestExistingEmailCode,
  verifyEmailCodeValue,
} from "./auth";
import { enforcePublicRateLimit } from "./rate-limit";
import {
  ServiceError,
  readJSON,
  runtime,
} from "./runtime";
import {
  createInternalAdminSession,
  insertInternalAuditEvent,
  internalAdminSessionFor,
  revokeInternalAdminSession,
} from "./supabase";
import {
  hashInternalSessionToken,
  internalSessionCookieHeader,
  internalSessionSeconds,
  internalSessionTokenFromCookie,
  internalUUIDPattern,
  parseInternalAdminUserIDs,
} from "../internal-console-policy";

export {
  hashInternalSessionToken,
  internalSessionCookieHeader,
  internalSessionCookieName,
  internalSessionTokenFromCookie,
  parseInternalAdminUserIDs,
} from "../internal-console-policy";

export interface InternalAdminPrincipal {
  userId: string;
  expiresAt: string;
}

export function configuredInternalAdminUserIDs(): Set<string> {
  return parseInternalAdminUserIDs(runtime().CUEASIDE_ADMIN_USER_IDS);
}

function requireAdminConfiguration(): Set<string> {
  const ids = configuredInternalAdminUserIDs();
  if (ids.size === 0) {
    throw new ServiceError(
      "The private Console has not been enabled yet.",
      503,
      "internal_console_not_configured",
    );
  }
  return ids;
}

function normalizedEmail(value?: string): string {
  const email = value?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ServiceError("Enter a valid email address.", 400, "invalid_email");
  }
  return email;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export async function requestInternalAdminCode(
  request: Request,
): Promise<Response> {
  requireAdminConfiguration();
  const body = await readJSON<{ email?: string }>(request, 8_000);
  const email = normalizedEmail(body.email);
  await enforcePublicRateLimit({
    request,
    scope: "internal-auth-code",
    subject: email,
    maximum: 3,
    windowSeconds: 15 * 60,
  });

  try {
    await requestExistingEmailCode(email);
  } catch (error) {
    // Do not let the private login page reveal whether an email has a
    // CueAside account. Configuration or provider outages must remain visible.
    if (error instanceof ServiceError && error.status >= 500) throw error;
  }

  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function verifyInternalAdminCode(
  request: Request,
): Promise<Response> {
  const adminIDs = requireAdminConfiguration();
  const body = await readJSON<{ email?: string; token?: string }>(request, 8_000);
  const email = normalizedEmail(body.email);
  const token = body.token?.trim() ?? "";
  if (!/^\d{6,8}$/.test(token)) {
    throw new ServiceError(
      "Enter the code from your email.",
      400,
      "invalid_code",
    );
  }
  await enforcePublicRateLimit({
    request,
    scope: "internal-auth-verify",
    subject: email,
    maximum: 8,
    windowSeconds: 15 * 60,
  });

  const result = await verifyEmailCodeValue(email, token);
  const rawUser =
    result.user && typeof result.user === "object"
      ? (result.user as Record<string, unknown>)
      : {};
  const userId = typeof rawUser.id === "string" ? rawUser.id.toLowerCase() : "";
  if (!adminIDs.has(userId)) {
    if (internalUUIDPattern.test(userId)) {
      await insertInternalAuditEvent({
        adminUserId: userId,
        action: "login_denied",
      });
    }
    throw new ServiceError(
      "This account does not have Console access.",
      403,
      "internal_access_denied",
    );
  }

  const sessionToken = randomToken();
  const tokenHash = await hashInternalSessionToken(sessionToken);
  const expiresAt = new Date(
    Date.now() + internalSessionSeconds * 1_000,
  ).toISOString();
  await createInternalAdminSession({ tokenHash, adminUserId: userId, expiresAt });
  await insertInternalAuditEvent({
    adminUserId: userId,
    action: "login_succeeded",
  });

  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": internalSessionCookieHeader(sessionToken),
      },
    },
  );
}

export async function internalAdminPrincipalForToken(
  sessionToken: string | null,
): Promise<InternalAdminPrincipal | null> {
  if (!sessionToken || !/^[A-Za-z0-9_-]{40,64}$/.test(sessionToken)) return null;
  const tokenHash = await hashInternalSessionToken(sessionToken);
  const session = await internalAdminSessionFor(tokenHash);
  if (!session) return null;
  if (!configuredInternalAdminUserIDs().has(session.admin_user_id.toLowerCase())) {
    await revokeInternalAdminSession(tokenHash);
    return null;
  }
  return {
    userId: session.admin_user_id,
    expiresAt: session.expires_at,
  };
}

export async function logoutInternalAdmin(request: Request): Promise<Response> {
  const sessionToken = internalSessionTokenFromCookie(
    request.headers.get("cookie"),
  );
  const principal = await internalAdminPrincipalForToken(sessionToken);
  if (sessionToken) {
    await revokeInternalAdminSession(await hashInternalSessionToken(sessionToken));
  }
  if (principal) {
    await insertInternalAuditEvent({
      adminUserId: principal.userId,
      action: "logout",
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/internal/login/", request.url).toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": internalSessionCookieHeader("", { clear: true }),
    },
  });
}
