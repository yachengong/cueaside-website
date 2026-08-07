import { CueAsideUser } from "./auth";
import {
  ServiceError,
  publicSiteURL,
  requireRuntimeValue,
  runtime,
} from "./runtime";
import {
  applySubscriptionUpdate,
  billingAccountFor,
  consumeMonthlyUsage,
  insertStripeEvent,
  monthlyUsageFor,
  stripeEventExists,
  upsertBillingAccount,
} from "./supabase";
import {
  PLAN_USAGE_LIMITS,
  PlanId,
  UsageKind,
  usageDecision,
} from "./usage-policy";

export type { PlanId, UsageKind } from "./usage-policy";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export interface Entitlement {
  active: boolean;
  paid: boolean;
  plan: "free" | "pro";
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
      paid: true,
      plan: "pro",
      status: "owner",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      bypass: true,
    };
  }

  const account = await billingAccountFor(userId);
  const status = account?.subscription_status ?? "inactive";
  const paid = ACTIVE_STATUSES.has(status);
  return {
    // A verified CueAside account always has Free access. `paid` and `plan`
    // distinguish a Stripe subscription from the permanent free tier without
    // breaking older macOS clients that only know whether access is active.
    active: true,
    paid,
    plan: paid ? "pro" : "free",
    status: paid ? status : "free",
    currentPeriodEnd: account?.current_period_end ?? null,
    cancelAtPeriodEnd: account?.cancel_at_period_end ?? false,
    bypass: false,
  };
}

export async function requireEntitlement(userId: string): Promise<Entitlement> {
  return entitlementFor(userId);
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
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      ...stripeHeaders(),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
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
  return billingAccountFor(userId);
}

/**
 * Cancel a subscription immediately (account deletion, not ordinary
 * cancellation — that goes through the Stripe portal and runs to period
 * end). A subscription Stripe no longer knows about counts as canceled.
 */
export async function cancelStripeSubscriptionImmediately(
  subscriptionId: string,
): Promise<void> {
  const response = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "DELETE",
      headers: stripeHeaders(),
    },
  );
  if (!response.ok && response.status !== 404) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new ServiceError(
      payload.error?.message ?? "Billing is temporarily unavailable.",
      502,
      "billing_error",
    );
  }
}

async function createStripeCustomer(user: CueAsideUser): Promise<string> {
  const existing = await accountFor(user.id);
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const params = new URLSearchParams();
  if (user.email) params.set("email", user.email);
  params.set("metadata[supabase_user_id]", user.id);
  const customer = await stripeRequest(
    "/customers",
    params,
    `cueaside-customer-${user.id}`,
  );
  const customerId = typeof customer.id === "string" ? customer.id : "";
  if (!customerId) {
    throw new ServiceError(
      "Stripe did not return a customer.",
      502,
      "billing_error",
    );
  }

  await upsertBillingAccount({
    user_id: user.id,
    email: user.email,
    stripe_customer_id: customerId,
    updated_at: Math.floor(Date.now() / 1000),
  });
  return customerId;
}

export async function createCheckout(user: CueAsideUser): Promise<string> {
  const current = await entitlementFor(user.id);
  if (current.paid) {
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
  const session = await stripeRequest(
    "/checkout/sessions",
    params,
    `cueaside-checkout-${user.id}-${Math.floor(Date.now() / 300_000)}`,
  );
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
      // Account management lives in the native macOS dashboard. The public
      // website does not expose an /account route, so returning there left a
      // successfully managed customer on a 404 page.
      return_url: `${publicSiteURL()}/`,
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

const USAGE_COLUMNS: Record<
  UsageKind,
  "answer_requests" | "transcription_requests" | "realtime_tokens"
> = {
  answerRequests: "answer_requests",
  transcriptionRequests: "transcription_requests",
  realtimeTokens: "realtime_tokens",
};

export async function recordUsage(
  userId: string,
  kind: UsageKind,
  plan: PlanId,
  unlimited = false,
): Promise<void> {
  const decision = usageDecision(plan, kind, unlimited);
  if (decision.unlimited || decision.limit === null) return;

  const allowed = await consumeMonthlyUsage({
    userId,
    kind: USAGE_COLUMNS[kind],
    limit: decision.limit,
  });
  if (!allowed) {
    throw new ServiceError(
      plan === "free"
        ? "Your Free monthly limit has been reached. Upgrade to CueAside Pro to continue."
        : "Your Pro monthly fair-use limit has been reached. Contact support if you need more.",
      429,
      "monthly_limit_reached",
    );
  }
}

export interface UsageCounter {
  used: number;
  limit: number;
  remaining: number;
}

export interface UsageSummary {
  periodStart: string;
  unlimited: boolean;
  answerRequests: UsageCounter;
  transcriptionRequests: UsageCounter;
  realtimeTokens: UsageCounter;
}

function usageCounter(used: number, limit: number): UsageCounter {
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
  };
}

export async function usageFor(
  userId: string,
  plan: PlanId,
  unlimited = false,
): Promise<UsageSummary> {
  const row = unlimited ? null : await monthlyUsageFor(userId);
  const now = new Date();
  const periodStart =
    row?.period_start ??
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
      2,
      "0",
    )}-01`;
  const limits = PLAN_USAGE_LIMITS[plan];
  return {
    periodStart,
    unlimited,
    answerRequests: usageCounter(row?.answer_requests ?? 0, limits.answerRequests),
    transcriptionRequests: usageCounter(
      row?.transcription_requests ?? 0,
      limits.transcriptionRequests,
    ),
    realtimeTokens: usageCounter(row?.realtime_tokens ?? 0, limits.realtimeTokens),
  };
}

export async function hasProcessedStripeEvent(
  eventId: string,
): Promise<boolean> {
  return stripeEventExists(eventId);
}

export async function markStripeEvent(
  eventId: string,
  eventType: string,
  eventCreated: number,
): Promise<void> {
  await insertStripeEvent({
    event_id: eventId,
    event_type: eventType,
    event_created: eventCreated,
    processed_at: Math.floor(Date.now() / 1000),
  });
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
  await applySubscriptionUpdate({
    userId: input.userId,
    email: input.email ?? null,
    customerId: input.customerId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    status: input.status,
    priceId: input.priceId ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    eventCreated: input.eventCreated,
  });
}
