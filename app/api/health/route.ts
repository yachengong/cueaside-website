import { runtime } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const value = runtime();
  return Response.json(
    {
      ok: true,
      services: {
        auth: Boolean(value.SUPABASE_URL && value.SUPABASE_ANON_KEY),
        billing: Boolean(
          value.STRIPE_SECRET_KEY &&
            value.STRIPE_WEBHOOK_SECRET &&
            value.STRIPE_PRICE_ID,
        ),
        ai: Boolean(value.OPENAI_API_KEY),
        storage: Boolean(value.DB),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
