import { requireUser } from "@/lib/server/auth";
import { createRealtimeToken } from "@/lib/server/openai";
import { errorResponse } from "@/lib/server/runtime";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return await createRealtimeToken(request, user);
  } catch (error) {
    return errorResponse(error);
  }
}
