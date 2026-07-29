import { createOAuthURL } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/runtime";

export async function POST(request: Request) {
  try {
    return await createOAuthURL(request);
  } catch (error) {
    return errorResponse(error);
  }
}
