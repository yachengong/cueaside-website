import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billingAccounts, stripeEvents, usageDaily } from "@/db/schema";
import { CueAsideUser } from "./auth";
import {
  ServiceError,
  publicSiteURL,
  requireRuntimeValue,
  runtime,
} from "./runtime";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export interface Entitlement {
  active: boolean;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  bypass: boolean;
}

function isBypassed(userId: string): boolean {
  return (runtime().BILLING_BYPASS_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(userId);
}

export async function entitlementFor(userId: string): Promise<Entitlement> {
  if (isBypassed(userId)) {
    return {
      active: true,
      status: "owner",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      bypass: true,
    };
  }

  const [account] = await getDb()
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.userId, userId))
    .limit(1);
  const status = account?.subscriptionStatus ?? "inactive";
  return {
    active: ACTIVE_STATUSES.has(status),
    status,
    currentPeriodEnd: account?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: account?.cancelAtPeriodEnd ?? false,
    bypass: false,
  };
}

export async function requireEntitlement(userId: string): Promise<Entitlement> {
  const entitlement = await entitlementFor(userId);
  if (!entitlement.active) {
    throw new ServiceError(
      "An active CueAside subscription is required.",
      402,
      "subscription_required",
    );
  }
  return entitlement;
}

function stripeHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${requireRuntimeValue(
      "STRIPE_SECRET_KEY",
      "Billing is not configured yet.",
    )}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function stripeRequest(
  path: string,
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: stripeHeaders(),
    body: params,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const nested = payload.error as Record<string, unknown> | undefined;
    const message =
      (typeof nested?.message === "string" && nested.message) ||
      "Billing is temporarily unavailable.";
    throw new ServiceError(message, 502, "billing_error");
  }
  return payload;
}

async function accountFor(userId: string) {
  const [account] = await getDb()
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.userId, userId))
    .limit(1);
  return account;
}

async function createStripeCustomer(user: CueAsideUser): Promise<string> {
  const existing = await accountFor(user.id);
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const params = new URLSearchParams();
  if (user.email) params.set("email", user.email);
  params.set("metadata[supabase_user_id]", user.id);
  const customer = await stripeRequest("/customers", params);
  const customerId = typeof customer.id === "string" ? customer.id : "";
  if (!customerId) {
    throw new ServiceError(
      "Stripe did not return a customer.",
      502,
      "billing_error",
    );
  }

  await getDb()
    .insert(billingAccounts)
    .values({
      userId: user.id,
      email: user.email,
      stripeCustomerId: customerId,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: billingAccounts.userId,
      set: {
        email: user.email,
        stripeCustomerId: customerId,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    });
  return customerId;
}

export async function createCheckout(user: CueAsideUser): Promise<string> {
  const current = await entitlementFor(user.id);
  if (current.active) {
    throw new ServiceError(
      "This account already has an active subscription.",
      409,
      "already_subscribed",
    );
  }

  const customerId = await createStripeCustomer(user);
  const params = new URLSearchParams({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    "line_items[0][price]": requireRuntimeValue(
      "STRIPE_PRICE_ID",
      "The CueAside plan is not configured yet.",
    ),
    "line_items[0][quantity]": "1",
    allow_promotion_codes: "true",
    success_url: `${publicSiteURL()}/checkout/success/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicSiteURL()}/checkout/canceled/`,
  });
  params.set("subscription_data[metadata][supabase_user_id]", user.id);
  const session = await stripeRequest("/checkout/sessions", params);
  const url = typeof session.url === "string" ? session.url : "";
  if (!url) {
    throw new ServiceError(
      "Stripe did not return a checkout URL.",
      502,
      "billing_error",
    );
  }
  return url;
}

export async function createPortal(user: CueAsideUser): Promise<string> {
  const customerId = await createStripeCustomer(user);
  const session = await stripeRequest(
    "/billing_portal/sessions",
    new URLSearchParams({
      customer: customerId,
      return_url: `${publicSiteURL()}/account/`,
    }),
  );
  const url = typeof session.url === "string" ? session.url : "";
  if (!url) {
    throw new ServiceError(
      "Stripe did not return a portal URL.",
      502,
      "billing_error",
    );
  }
  return url;
}

function usageDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export type UsageKind =
  | "answerRequests"
  | "transcriptionRequests"
  | "realtimeTokens";

const USAGE_LIMITS: Record<UsageKind, number> = {
  answerRequests: 500,
  transcriptionRequests: 500,
  realtimeTokens: 1_000,
};

export async function recordUsage(
  userId: string,
  kind: UsageKind,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const date = usageDate();
  const db = getDb();
  await db
    .insert(usageDaily)
    .values({
      userId,
      usageDate: date,
      [kind]: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [usageDaily.userId, usageDaily.usageDate],
      set: {
        [kind]: sql`${usageDaily[kind]} + 1`,
        updatedAt: now,
      },
    });

  const [usage] = await db
    .select()
    .from(usageDaily)
    .where(
      and(eq(usageDaily.userId, userId), eq(usageDaily.usageDate, date)),
    )
    .limit(1);
  if ((usage?.[kind] ?? 0) > USAGE_LIMITS[kind]) {
    throw new ServiceError(
      "Today’s fair-use limit has been reached. Contact support if you need more.",
      429,
      "daily_limit_reached",
    );
  }
}

export async function hasProcessedStripeEvent(
  eventId: string,
): Promise<boolean> {
  const [event] = await getDb()
    .select({ id: stripeEvents.eventId })
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, eventId))
    .limit(1);
  return Boolean(event);
}

export async function markStripeEvent(
  eventId: string,
  eventType: string,
  eventCreated: number,
): Promise<void> {
  await getDb()
    .insert(stripeEvents)
    .values({
      eventId,
      eventType,
      eventCreated,
      processedAt: Math.floor(Date.now() / 1000),
    })
    .onConflictDoNothing();
}

export async function updateSubscription(input: {
  userId: string;
  email?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  status: string;
  priceId?: string | null;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
  eventCreated: number;
}): Promise<void> {
  const existing = await accountFor(input.userId);
  if (
    existing &&
    input.eventCreated < (existing.latestStripeEventCreated ?? 0)
  ) {
    return;
  }

  await getDb()
    .insert(billingAccounts)
    .values({
      userId: input.userId,
      email: input.email ?? null,
      stripeCustomerId: input.customerId ?? null,
      stripeSubscriptionId: input.subscriptionId ?? null,
      subscriptionStatus: input.status,
      priceId: input.priceId ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      latestStripeEventCreated: input.eventCreated,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: billingAccounts.userId,
      set: {
        email: input.email ?? existing?.email ?? null,
        stripeCustomerId:
          input.customerId ?? existing?.stripeCustomerId ?? null,
        stripeSubscriptionId:
          input.subscriptionId ?? existing?.stripeSubscriptionId ?? null,
        subscriptionStatus: input.status,
        priceId: input.priceId ?? existing?.priceId ?? null,
        currentPeriodEnd:
          input.currentPeriodEnd ?? existing?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        latestStripeEventCreated: input.eventCreated,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    });
}
