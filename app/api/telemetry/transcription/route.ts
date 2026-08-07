import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/runtime";
import { recordTranscriptionDiagnostic } from "@/lib/server/transcription-diagnostics";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return await recordTranscriptionDiagnostic(request, user);
  } catch (error) {
    return errorResponse(error);
  }
}
