import type { AnswerMetric } from "./answer-metrics";
import {
  deploymentEnvironment,
  ServiceError,
  requireRuntimeValue,
} from "./runtime";
import { observeExternalCall } from "./observability";

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

export interface InternalAdminSessionRow {
  token_hash: string;
  admin_user_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface InternalAuthUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  confirmedAt: string | null;
}

export interface InternalAuthUserPage {
  users: InternalAuthUser[];
  page: number;
  perPage: number;
  total: number;
}

export interface InternalAccountRow {
  user_id: string;
  email: string | null;
  subscription_status: string;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  updated_at: number;
}

export interface InternalAuditRow {
  id: number;
  admin_user_id: string | null;
  action: string;
  target_user_id: string | null;
  occurred_at: string;
}

export interface InternalAnswerMetricRow {
  id: number;
  recorded_at: string;
  deployment: "production" | "preview" | "development";
  model: "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";
  depth: "instinct" | "balanced" | "precise" | "thinking";
  reasoning_effort: "none" | "low" | "medium";
  service_tier: "standard" | "fast";
  status:
    | "completed"
    | "incomplete"
    | "failed"
    | "cancelled"
    | "stream_error"
    | "ended";
  http_status: number;
  first_readable_ms: number | null;
  duration_ms: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  estimated_cost_micro_usd: number;
  pricing_version: string;
}

export interface InternalAnswerMetricPage {
  rows: InternalAnswerMetricRow[];
  page: number;
  perPage: number;
  total: number;
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
  const response = await observeExternalCall(
    { service: "supabase", operation: "storage_request" },
    () => fetch(adminURL(path), {
      ...init,
      headers: adminHeaders(init.headers),
      cache: "no-store",
    }),
  );
  const text = await response.text();
  if (!response.ok) {
    throw new ServiceError(
      "Account storage is temporarily unavailable.",
      503,
      "storage_unavailable",
    );
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function adminPageRequest<T>(
  path: string,
  input: { page: number; perPage: number },
): Promise<{ rows: T[]; page: number; perPage: number; total: number }> {
  const page = Math.max(1, Math.floor(input.page));
  const perPage = Math.min(1_000, Math.max(1, Math.floor(input.perPage)));
  const first = (page - 1) * perPage;
  const last = first + perPage - 1;
  const response = await observeExternalCall(
    { service: "supabase", operation: "storage_request" },
    () => fetch(adminURL(path), {
      headers: adminHeaders({
        Prefer: "count=exact",
        Range: `${first}-${last}`,
        "Range-Unit": "items",
      }),
      cache: "no-store",
    }),
  );
  const text = await response.text();
  const totalMatch = response.headers.get("content-range")?.match(/\/(\d+)$/);
  const total = totalMatch
    ? Number.parseInt(totalMatch[1], 10)
    : first;
  // PostgREST returns 416 when a valid page starts beyond the final row. That
  // is an empty page, not a storage outage; preserve the exact total so the UI
  // can offer navigation back into range.
  if (response.status === 416 && totalMatch) {
    return { rows: [], page, perPage, total };
  }
  if (!response.ok) {
    throw new ServiceError(
      "Account storage is temporarily unavailable.",
      503,
      "storage_unavailable",
    );
  }
  const rows = (text ? JSON.parse(text) : []) as T[];
  const resolvedTotal = totalMatch ? total : first + rows.length;
  return {
    rows,
    page,
    perPage,
    total: Number.isFinite(resolvedTotal)
      ? Math.max(0, resolvedTotal)
      : first + rows.length,
  };
}

function authAdminURL(path: string): string {
  return `${requireRuntimeValue(
    "SUPABASE_URL",
    "Account storage is not configured yet.",
  ).replace(/\/+$/, "")}/auth/v1/admin/${path.replace(/^\/+/, "")}`;
}

async function authAdminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await observeExternalCall(
    { service: "supabase", operation: "auth_admin_request" },
    () => fetch(authAdminURL(path), {
      ...init,
      headers: adminHeaders(init.headers),
      cache: "no-store",
    }),
  );
  const text = await response.text();
  if (!response.ok) {
    throw new ServiceError(
      "Account directory is temporarily unavailable.",
      503,
      "account_directory_unavailable",
    );
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function createInternalAdminSession(input: {
  tokenHash: string;
  adminUserId: string;
  expiresAt: string;
}): Promise<void> {
  await adminRequest("internal_admin_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      token_hash: input.tokenHash,
      admin_user_id: input.adminUserId,
      expires_at: input.expiresAt,
    }),
  });
}

export async function internalAdminSessionFor(
  tokenHash: string,
): Promise<InternalAdminSessionRow | null> {
  const now = encodeURIComponent(new Date().toISOString());
  const rows = await adminRequest<InternalAdminSessionRow[]>(
    `internal_admin_sessions?token_hash=eq.${encodeURIComponent(
      tokenHash,
    )}&revoked_at=is.null&expires_at=gt.${now}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function revokeInternalAdminSession(
  tokenHash: string,
): Promise<void> {
  await adminRequest(
    `internal_admin_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    },
  );
}

export async function insertInternalAuditEvent(input: {
  adminUserId: string | null;
  action: string;
  targetUserId?: string | null;
  pageNumber?: number | null;
}): Promise<void> {
  await adminRequest("internal_audit_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      admin_user_id: input.adminUserId,
      action: input.action,
      target_user_id: input.targetUserId ?? null,
      page_number: input.pageNumber ?? null,
    }),
  });
}

export async function listInternalAuthUsers(input: {
  page: number;
  perPage: number;
}): Promise<InternalAuthUserPage> {
  const page = Math.max(1, Math.floor(input.page));
  const perPage = Math.min(100, Math.max(1, Math.floor(input.perPage)));
  const payload = await authAdminRequest<{
    users?: Array<Record<string, unknown>>;
    total?: number;
  }>(`users?page=${page}&per_page=${perPage}`);
  const rawUsers = Array.isArray(payload.users) ? payload.users : [];
  const users = rawUsers.flatMap((row): InternalAuthUser[] => {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) return [];
    return [{
      id,
      email: typeof row.email === "string" ? row.email : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      lastSignInAt:
        typeof row.last_sign_in_at === "string" ? row.last_sign_in_at : null,
      confirmedAt:
        typeof row.confirmed_at === "string" ? row.confirmed_at : null,
    }];
  });
  return {
    users,
    page,
    perPage,
    total:
      typeof payload.total === "number" && Number.isFinite(payload.total)
        ? Math.max(0, Math.floor(payload.total))
        : (page - 1) * perPage + users.length,
  };
}

function inUUIDFilter(userIds: string[]): string | null {
  const valid = userIds.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(id),
  );
  return valid.length > 0 ? `in.(${valid.join(",")})` : null;
}

export async function internalAccountsFor(
  userIds: string[],
): Promise<InternalAccountRow[]> {
  const filter = inUUIDFilter(userIds);
  if (!filter) return [];
  return adminRequest<InternalAccountRow[]>(
    `billing_accounts?user_id=${filter}&select=user_id,email,subscription_status,current_period_end,cancel_at_period_end,updated_at`,
  );
}

export async function internalMonthlyUsageFor(
  userIds: string[],
): Promise<MonthlyUsageRow[]> {
  const filter = inUUIDFilter(userIds);
  if (!filter) return [];
  const now = new Date();
  const periodStart = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}-01`;
  return adminRequest<MonthlyUsageRow[]>(
    `usage_monthly?user_id=${filter}&period_start=eq.${periodStart}&select=*`,
  );
}

export async function recentInternalAuditEvents(
  limit = 20,
): Promise<InternalAuditRow[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  return adminRequest<InternalAuditRow[]>(
    `internal_audit_log?select=id,admin_user_id,action,target_user_id,occurred_at&order=occurred_at.desc&limit=${safeLimit}`,
  );
}

export async function recordAnswerGenerationMetric(
  metric: AnswerMetric,
): Promise<void> {
  await adminRequest("answer_generation_metrics", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      deployment: deploymentEnvironment(),
      model: metric.model,
      depth: metric.depth,
      reasoning_effort: metric.reasoningEffort,
      service_tier: metric.serviceTier,
      status: metric.status,
      http_status: metric.httpStatus,
      first_readable_ms: metric.firstReadableMs,
      duration_ms: metric.durationMs,
      input_tokens: metric.inputTokens,
      cached_input_tokens: metric.cachedInputTokens,
      output_tokens: metric.outputTokens,
      reasoning_tokens: metric.reasoningTokens,
      estimated_cost_micro_usd: metric.estimatedCostMicroUSD,
      pricing_version: metric.pricingVersion,
    }),
  });
}

export async function internalAnswerMetricsPage(input: {
  hours?: number;
  page?: number;
  perPage?: number;
  model?: InternalAnswerMetricRow["model"];
  depth?: InternalAnswerMetricRow["depth"];
  status?: InternalAnswerMetricRow["status"];
} = {}): Promise<InternalAnswerMetricPage> {
  const hours = Math.min(24 * 30, Math.max(1, Math.floor(input.hours ?? 24)));
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const perPage = Math.min(1_000, Math.max(1, Math.floor(input.perPage ?? 20)));
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1_000).toISOString();
  const columns = [
    "id",
    "recorded_at",
    "deployment",
    "model",
    "depth",
    "reasoning_effort",
    "service_tier",
    "status",
    "http_status",
    "first_readable_ms",
    "duration_ms",
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "reasoning_tokens",
    "estimated_cost_micro_usd",
    "pricing_version",
  ].join(",");
  const query = new URLSearchParams({
    recorded_at: `gte.${cutoff}`,
    select: columns,
    order: "recorded_at.desc,id.desc",
  });
  if (input.model) query.set("model", `eq.${input.model}`);
  if (input.depth) query.set("depth", `eq.${input.depth}`);
  if (input.status) query.set("status", `eq.${input.status}`);
  return adminPageRequest<InternalAnswerMetricRow>(
    `answer_generation_metrics?${query.toString()}`,
    { page, perPage },
  );
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

export async function insertWaitlistSignup(input: {
  email: string;
  source: string;
}): Promise<void> {
  await adminRequest("waitlist_signups?on_conflict=email", {
    method: "POST",
    headers: {
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      email: input.email,
      source: input.source,
      created_at: Math.floor(Date.now() / 1_000),
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

/**
 * Remove every row we hold for a user. rate_limits is keyed by HMAC hashes
 * that cannot be mapped back to a user id; those entries expire on their
 * own and contain no contact or content data.
 */
export async function deleteUserData(userId: string): Promise<void> {
  const id = encodeURIComponent(userId);
  for (const path of [
    `usage_monthly?user_id=eq.${id}`,
    `usage_daily?user_id=eq.${id}`,
    `billing_accounts?user_id=eq.${id}`,
  ]) {
    await adminRequest(path, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const base = requireRuntimeValue(
    "SUPABASE_URL",
    "Account storage is not configured yet.",
  ).replace(/\/+$/, "");
  const response = await observeExternalCall(
    { service: "supabase", operation: "auth_delete" },
    () => fetch(
      `${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: adminHeaders(),
        cache: "no-store",
      },
    ),
  );
  // 404 means the auth user is already gone — deletion must be idempotent.
  if (!response.ok && response.status !== 404) {
    await response.body?.cancel();
    throw new ServiceError(
      "Account deletion is temporarily unavailable.",
      503,
      "storage_unavailable",
    );
  }
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
