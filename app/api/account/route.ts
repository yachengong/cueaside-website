import { requireUser } from "@/lib/server/auth";
import { entitlementFor } from "@/lib/server/billing";
import { errorResponse } from "@/lib/server/runtime";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const entitlement = await entitlementFor(user.id);
    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        subscription: entitlement,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
