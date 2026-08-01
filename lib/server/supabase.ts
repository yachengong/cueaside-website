import { ServiceError, requireRuntimeValue } from "./runtime";

export interface BillingAccountRow {
  user_id: string;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  price_id: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  latest_stripe_event_created: number;
  updated_at: number;
}

export interface MonthlyUsageRow {
  user_id: string;
  period_start: string;
  answer_requests: number;
  transcription_requests: number;
  realtime_tokens: number;
  updated_at: number;
}

function adminURL(path: string): string {
  return `${requireRuntimeValue(
    "SUPABASE_URL",
    "Account storage is not configured yet.",
  ).replace(/\/+$/, "")}/rest/v1/${path.replace(/^\/+/, "")}`;
}

function adminHeaders(extra?: HeadersInit): Headers {
  const serviceKey = requireRuntimeValue(
    "SUPABASE_SERVICE_ROLE_KEY",
    "Account storage is not configured yet.",
  );
  const headers = new Headers(extra);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(adminURL(path), {
    ...init,
    headers: adminHeaders(init.headers),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("Supabase storage error", response.status, text.slice(0, 800));
    throw new ServiceError(
      "Account storage is temporarily unavailable.",
      503,
      "storage_unavailable",
    );
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function billingAccountFor(
  userId: string,
): Promise<BillingAccountRow | null> {
  const rows = await adminRequest<BillingAccountRow[]>(
    `billing_accounts?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function upsertBillingAccount(
  row: Partial<BillingAccountRow> & Pick<BillingAccountRow, "user_id">,
): Promise<void> {
  await adminRequest("billing_accounts?on_conflict=user_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
}

export async function stripeEventExists(eventId: string): Promise<boolean> {
  const rows = await adminRequest<Array<{ event_id: string }>>(
    `stripe_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id&limit=1`,
  );
  return rows.length > 0;
}

export async function insertStripeEvent(input: {
  event_id: string;
  event_type: string;
  event_created: number;
  processed_at: number;
}): Promise<void> {
  await adminRequest("stripe_events?on_conflict=event_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(input),
  });
}

export async function consumeMonthlyUsage(input: {
  userId: string;
  kind: "answer_requests" | "transcription_requests" | "realtime_tokens";
  limit: number;
}): Promise<boolean> {
  return adminRequest<boolean>("rpc/consume_monthly_usage", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: input.userId,
      p_kind: input.kind,
      p_limit: input.limit,
    }),
  });
}

export async function monthlyUsageFor(
  userId: string,
): Promise<MonthlyUsageRow | null> {
  const now = new Date();
  const periodStart = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}-01`;
  const rows = await adminRequest<MonthlyUsageRow[]>(
    `usage_monthly?user_id=eq.${encodeURIComponent(
      userId,
    )}&period_start=eq.${periodStart}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function consumeRateLimit(input: {
  key: string;
  maximum: number;
  windowSeconds: number;
}): Promise<boolean> {
  return adminRequest<boolean>("rpc/consume_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      p_key: input.key,
      p_maximum: input.maximum,
      p_window_seconds: input.windowSeconds,
      p_now: Math.floor(Date.now() / 1_000),
    }),
  });
}

export async function applySubscriptionUpdate(input: {
  userId: string;
  email: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  status: string;
  priceId: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  eventCreated: number;
}): Promise<boolean> {
  return adminRequest<boolean>("rpc/apply_subscription_update", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: input.userId,
      p_email: input.email,
      p_customer_id: input.customerId,
      p_subscription_id: input.subscriptionId,
      p_status: input.status,
      p_price_id: input.priceId,
      p_current_period_end: input.currentPeriodEnd,
      p_cancel_at_period_end: input.cancelAtPeriodEnd,
      p_event_created: input.eventCreated,
      p_updated_at: Math.floor(Date.now() / 1_000),
    }),
  });
}
