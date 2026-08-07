const SESSION_SECONDS = 8 * 60 * 60;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseInternalAdminUserIDs(raw?: string): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value)),
  );
}

export async function hashInternalSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Buffer.from(digest).toString("hex");
}

export function internalSessionCookieName(
  production = process.env.NODE_ENV === "production",
): string {
  return production
    ? "__Host-cueaside-internal-session"
    : "cueaside-internal-session";
}

export function internalSessionCookieHeader(
  value: string,
  input: { clear?: boolean; production?: boolean } = {},
): string {
  const production = input.production ?? process.env.NODE_ENV === "production";
  const pieces = [
    `${internalSessionCookieName(production)}=${input.clear ? "" : value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${input.clear ? 0 : SESSION_SECONDS}`,
  ];
  if (production) pieces.push("Secure");
  return pieces.join("; ");
}

export function internalSessionTokenFromCookie(
  cookieHeader: string | null,
  production = process.env.NODE_ENV === "production",
): string | null {
  const name = internalSessionCookieName(production);
  for (const pair of (cookieHeader ?? "").split(";")) {
    const [rawName, ...rawValue] = pair.trim().split("=");
    if (rawName === name) {
      const value = rawValue.join("=").trim();
      return /^[A-Za-z0-9_-]{40,64}$/.test(value) ? value : null;
    }
  }
  return null;
}

export const internalSessionSeconds = SESSION_SECONDS;
export const internalUUIDPattern = UUID_PATTERN;
