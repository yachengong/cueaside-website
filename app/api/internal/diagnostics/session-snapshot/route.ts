import { requireUser } from "@/lib/server/auth";
import { recordInternalSessionDiagnostic } from "@/lib/server/internal-session-diagnostics";
import { errorResponse } from "@/lib/server/runtime";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return await recordInternalSessionDiagnostic(request, user);
  } catch (error) {
    return errorResponse(error);
  }
}
