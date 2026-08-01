import { requireUser } from "@/lib/server/auth";
import { entitlementFor, usageFor } from "@/lib/server/billing";
import { errorResponse } from "@/lib/server/runtime";

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
