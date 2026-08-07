export interface AccountDeletionDependencies {
  billingAccountFor: (
    userId: string,
  ) => Promise<{ stripe_subscription_id: string | null } | null>;
  cancelStripeSubscriptionImmediately: (
    subscriptionId: string,
  ) => Promise<void>;
  deleteUserData: (userId: string) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
}

/**
 * Delete in the only safe order: stop recurring billing, remove CueAside's
 * product rows, then remove the identity. Each await is intentional; a failed
 * earlier step prevents a later destructive step and makes retry possible.
 */
export async function deleteCueAsideAccount(
  userId: string,
  dependencies: AccountDeletionDependencies,
): Promise<void> {
  const account = await dependencies.billingAccountFor(userId);
  if (account?.stripe_subscription_id) {
    await dependencies.cancelStripeSubscriptionImmediately(
      account.stripe_subscription_id,
    );
  }

  await dependencies.deleteUserData(userId);
  await dependencies.deleteAuthUser(userId);
}

