import { errorResponse } from "@/lib/server/runtime";
import { handleStripeWebhook } from "@/lib/server/stripe-webhook";

export async function POST(request: Request) {
  try {
    return await handleStripeWebhook(request);
  } catch (error) {
    return errorResponse(error);
  }
}
