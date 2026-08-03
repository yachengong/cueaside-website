import { requireUser } from "@/lib/server/auth";
import {
  cancelStripeSubscriptionImmediately,
  entitlementFor,
  usageFor,
} from "@/lib/server/billing";
import { errorResponse } from "@/lib/server/runtime";
import {
  billingAccountFor,
  deleteAuthUser,
  deleteUserData,
} from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const entitlement = await entitlementFor(user.id);
    const usage = await usageFor(
      user.id,
      entitlement.plan,
      entitlement.bypass,
    );
    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        subscription: entitlement,
        usage,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Self-serve account deletion, in the order that protects the user:
 * stop billing first, then remove our rows, then the auth identity.
 * Idempotent — deleting an already-deleted account succeeds.
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);

    const account = await billingAccountFor(user.id);
    if (account?.stripe_subscription_id) {
      await cancelStripeSubscriptionImmediately(account.stripe_subscription_id);
    }

    await deleteUserData(user.id);
    await deleteAuthUser(user.id);

    return Response.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
