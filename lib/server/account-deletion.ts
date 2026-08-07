export interface AccountDeletionDependencies {
  billingAccountFor: (
    userId: string,
  ) => Promise<{
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  } | null>;
  cancelStripeSubscriptionImmediately: (
    subscriptionId: string,
  ) => Promise<void>;
  deleteStripeCustomer: (customerId: string) => Promise<void>;
  deleteUserData: (userId: string, email: string | null) => Promise<void>;
  revokeUserSessions: (accessToken: string) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
}

export interface AccountDeletionRequest {
  userId: string;
  email: string | null;
  accessToken: string;
}

/**
 * Delete in a recoverable order: stop recurring billing and remove the Stripe
 * customer before deleting CueAside rows. Revoke every refresh session only
 * after external and product deletion has succeeded, then remove the identity.
 * Each provider operation is idempotent so an interrupted request can be
 * retried while the Auth user still exists.
 */
export async function deleteCueAsideAccount(
  input: AccountDeletionRequest,
  dependencies: AccountDeletionDependencies,
): Promise<void> {
  const account = await dependencies.billingAccountFor(input.userId);
  if (account?.stripe_subscription_id) {
    await dependencies.cancelStripeSubscriptionImmediately(
      account.stripe_subscription_id,
    );
  }
  if (account?.stripe_customer_id) {
    await dependencies.deleteStripeCustomer(account.stripe_customer_id);
  }

  await dependencies.deleteUserData(input.userId, input.email);
  await dependencies.revokeUserSessions(input.accessToken);
  await dependencies.deleteAuthUser(input.userId);
}
