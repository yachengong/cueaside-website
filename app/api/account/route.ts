import {
  requireAccessToken,
  requireUser,
  revokeUserSessions,
} from "@/lib/server/auth";
import {
  cancelStripeSubscriptionImmediately,
  deleteStripeCustomer,
  entitlementFor,
  usageFor,
} from "@/lib/server/billing";
import { errorResponse, readJSON, ServiceError } from "@/lib/server/runtime";
import { deleteCueAsideAccount } from "@/lib/server/account-deletion";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/server/account-deletion-policy";
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
 * stop billing and remove the Stripe customer first, then remove our rows,
 * revoke refresh sessions, and finally remove the auth identity.
 */
export async function DELETE(request: Request) {
  try {
    const accessToken = requireAccessToken(request);
    const user = await requireUser(request);
    const body = await readJSON<{ confirmation?: string }>(request, 1_000);
    if (body.confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
      throw new ServiceError(
        "Confirm account deletion before continuing.",
        400,
        "deletion_confirmation_required",
      );
    }

    await deleteCueAsideAccount(
      {
        userId: user.id,
        email: user.email,
        accessToken,
      },
      {
        billingAccountFor,
        cancelStripeSubscriptionImmediately,
        deleteStripeCustomer,
        deleteUserData,
        revokeUserSessions,
        deleteAuthUser,
      },
    );

    return Response.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
