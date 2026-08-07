import { requireUser } from "@/lib/server/auth";
import { createDeepgramToken } from "@/lib/server/deepgram";
import { errorResponse } from "@/lib/server/runtime";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return await createDeepgramToken(request, user);
  } catch (error) {
    return errorResponse(error);
  }
}
