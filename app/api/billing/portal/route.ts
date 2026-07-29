import { requireUser } from "@/lib/server/auth";
import { createPortal } from "@/lib/server/billing";
import { errorResponse } from "@/lib/server/runtime";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(
      { url: await createPortal(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
