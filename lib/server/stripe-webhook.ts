import {
  hasProcessedStripeEvent,
  markStripeEvent,
  updateSubscription,
} from "./billing";
import {
  ServiceError,
  requireRuntimeValue,
} from "./runtime";

type StripeObject = Record<string, unknown>;
type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: StripeObject };
};

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
): Promise<void> {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  const timestampNumber = Number(timestamp);
  if (
    !timestamp ||
    !Number.isFinite(timestampNumber) ||
    Math.abs(Date.now() / 1_000 - timestampNumber) > 300 ||
    signatures.length === 0
  ) {
    throw new ServiceError(
      "Invalid Stripe signature.",
      400,
      "invalid_signature",
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireRuntimeValue("STRIPE_WEBHOOK_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${payload}`),
    ),
  );
  if (!signatures.some((signature) => timingSafeEqual(signature, expected))) {
    throw new ServiceError(
      "Invalid Stripe signature.",
      400,
      "invalid_signature",
    );
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function metadata(object: StripeObject): Record<string, unknown> {
  return object.metadata &&
    typeof object.metadata === "object" &&
    !Array.isArray(object.metadata)
    ? (object.metadata as Record<string, unknown>)
    : {};
}

async function subscriptionFromStripe(id: string): Promise<StripeObject> {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${id}`, {
    headers: {
      Authorization: `Bearer ${requireRuntimeValue("STRIPE_SECRET_KEY")}`,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as StripeObject;
  if (!response.ok) {
    throw new ServiceError(
      "Could not verify the subscription.",
      502,
      "billing_error",
    );
  }
  return payload;
}

function subscriptionFields(object: StripeObject) {
  const items = object.items as Record<string, unknown> | undefined;
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = (data[0] ?? {}) as Record<string, unknown>;
  const price = (first.price ?? {}) as Record<string, unknown>;
  return {
    subscriptionId: stringValue(object.id),
    customerId: stringValue(object.customer),
    status: stringValue(object.status) ?? "inactive",
    priceId: stringValue(price.id),
    currentPeriodEnd:
      typeof object.current_period_end === "number"
        ? object.current_period_end
        : null,
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
    userId: stringValue(metadata(object).supabase_user_id),
  };
}

async function applySubscription(
  subscription: StripeObject,
  eventCreated: number,
  fallbackUserId?: string | null,
  email?: string | null,
): Promise<void> {
  const fields = subscriptionFields(subscription);
  const userId = fields.userId ?? fallbackUserId ?? null;
  if (!userId) {
    throw new ServiceError(
      "Subscription is missing its CueAside account.",
      400,
      "missing_user_id",
    );
  }
  await updateSubscription({
    ...fields,
    userId,
    email,
    eventCreated,
  });
}

export async function handleStripeWebhook(request: Request): Promise<Response> {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  await verifyStripeSignature(payload, signature);

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    throw new ServiceError("Invalid Stripe event.", 400, "invalid_event");
  }
  if (!event.id || !event.type || !event.data?.object) {
    throw new ServiceError("Invalid Stripe event.", 400, "invalid_event");
  }
  if (await hasProcessedStripeEvent(event.id)) {
    return Response.json({ received: true, duplicate: true });
  }

  const object = event.data.object;
  if (event.type === "checkout.session.completed") {
    const subscriptionId = stringValue(object.subscription);
    const userId =
      stringValue(object.client_reference_id) ??
      stringValue(metadata(object).supabase_user_id);
    if (subscriptionId) {
      const subscription = await subscriptionFromStripe(subscriptionId);
      const details = object.customer_details as
        | Record<string, unknown>
        | undefined;
      await applySubscription(
        subscription,
        event.created,
        userId,
        stringValue(details?.email),
      );
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await applySubscription(object, event.created);
  }

  await markStripeEvent(event.id, event.type, event.created);
  return Response.json({ received: true });
}
