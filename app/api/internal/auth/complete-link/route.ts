import { completeInternalAdminLink } from "@/lib/server/internal-auth";
import { errorResponse } from "@/lib/server/runtime";

export async function POST(request: Request) {
  try {
    return await completeInternalAdminLink(request);
  } catch (error) {
    return errorResponse(error);
  }
}
