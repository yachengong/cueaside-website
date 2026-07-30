import { enforcePublicRateLimit } from "@/lib/server/rate-limit";
import { ServiceError, errorResponse, readJSON } from "@/lib/server/runtime";
import { insertWaitlistSignup } from "@/lib/server/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  try {
    await enforcePublicRateLimit({
      request,
      scope: "waitlist",
      maximum: 6,
      windowSeconds: 600,
    });

    const body = await readJSON<{ email?: unknown; source?: unknown }>(
      request,
      4_000,
    );
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new ServiceError(
        "Enter a valid email address.",
        400,
        "invalid_email",
      );
    }

    const source = String(body.source ?? "website").slice(0, 60);
    await insertWaitlistSignup({ email, source });
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
