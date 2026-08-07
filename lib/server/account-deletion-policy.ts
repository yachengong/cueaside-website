export const ACCOUNT_DELETION_CONFIRMATION = "DELETE";
export const ACCOUNT_DELETION_LOGOUT_PATH = "/auth/v1/logout?scope=global";

export function bearerTokenFromAuthorization(
  authorization: string | null,
): string | null {
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

export function stripeCustomerDeletionPath(customerId: string): string {
  return `/customers/${encodeURIComponent(customerId)}`;
}

export function accountDataDeletionPaths(
  userId: string,
  email: string | null,
): string[] {
  const id = encodeURIComponent(userId);
  const paths = [
    `usage_monthly?user_id=eq.${id}`,
    `usage_daily?user_id=eq.${id}`,
  ];
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  if (normalizedEmail) {
    paths.push(
      `waitlist_signups?email=eq.${encodeURIComponent(normalizedEmail)}`,
    );
  }
  paths.push(`billing_accounts?user_id=eq.${id}`);
  return paths;
}
