import { requireUser } from "@/lib/server/auth";
import { proxyAnswer } from "@/lib/server/openai";
import { errorResponse } from "@/lib/server/runtime";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return await proxyAnswer(request, user);
  } catch (error) {
    return errorResponse(error);
  }
}
