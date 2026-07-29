import { runtime } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const value = runtime();
  return Response.json(
    {
      ok: true,
      services: {
        auth: Boolean(value.SUPABASE_URL && value.SUPABASE_ANON_KEY),
        googleSignIn: value.AUTH_GOOGLE_ENABLED === "true",
        appleSignIn: value.AUTH_APPLE_ENABLED === "true",
        billing: Boolean(
          value.STRIPE_SECRET_KEY &&
            value.STRIPE_WEBHOOK_SECRET &&
            value.STRIPE_PRICE_ID,
        ),
        ai: Boolean(value.OPENAI_API_KEY),
        storage: Boolean(
          value.SUPABASE_URL && value.SUPABASE_SERVICE_ROLE_KEY,
        ),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
