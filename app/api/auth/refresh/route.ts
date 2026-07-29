import { refreshSession } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/runtime";

export async function POST(request: Request) {
  try {
    return await refreshSession(request);
  } catch (error) {
    return errorResponse(error);
  }
}
