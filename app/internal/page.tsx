import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  configuredInternalAdminUserIDs,
  internalAdminPrincipalForToken,
  internalSessionCookieName,
} from "@/lib/server/internal-auth";
import {
  deploymentEnvironment,
  pseudonymousIdentifier,
  publicSiteURL,
  runtime,
} from "@/lib/server/runtime";
import {
  liveProviderProbes,
  providerShapeChecks,
  type LiveProviderHealth,
  type ProviderProbe,
} from "@/lib/server/provider-health";
import {
  insertInternalAuditEvent,
  internalAnswerMetricsPage,
  internalAnswerMetricsSummary,
  internalAccountsFor,
  internalMonthlyUsageFor,
  internalUsageSummary,
  listInternalAuthUsers,
  recentInternalAuditEvents,
  recentInternalSessionDiagnosticSnapshots,
  recentInternalTranscriptionDiagnostics,
  type InternalSessionDiagnosticFact,
} from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const METRIC_PAGE_SIZE = 20;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

type MetricModel = "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";
type MetricDepth = "instinct" | "balanced" | "precise" | "thinking";
type MetricOperation =
  | "answer"
  | "prep_answer"
  | "vision"
  | "context_prepare"
  | "state_seed"
  | "state_update"
  | "role_guidance"
  | "reply_check";
type MetricStatus =
  | "completed"
  | "incomplete"
  | "failed"
  | "cancelled"
  | "stream_error"
  | "ended";

const METRIC_MODELS = new Set<MetricModel>([
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
]);
const METRIC_DEPTHS = new Set<MetricDepth>([
  "instinct",
  "balanced",
  "precise",
  "thinking",
]);
const METRIC_OPERATIONS = new Set<MetricOperation>([
  "answer",
  "prep_answer",
  "vision",
  "context_prepare",
  "state_seed",
  "state_update",
  "role_guidance",
  "reply_check",
]);
const METRIC_STATUSES = new Set<MetricStatus>([
  "completed",
  "incomplete",
  "failed",
  "cancelled",
  "stream_error",
  "ended",
]);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function allowedValue<T extends string>(
  value: string | string[] | undefined,
  allowed: Set<T>,
): T | undefined {
  const candidate = firstValue(value);
  return candidate && allowed.has(candidate as T) ? candidate as T : undefined;
}

function metricHours(value: string | string[] | undefined): 24 | 168 | 720 {
  const candidate = Number.parseInt(firstValue(value) ?? "24", 10);
  return candidate === 168 || candidate === 720 ? candidate : 24;
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

function diagnosticSessionKey(
  value: string | string[] | undefined,
): string | undefined {
  const candidate = firstValue(value)?.trim().toLowerCase();
  return candidate && /^[a-f0-9]{64}$/.test(candidate) ? candidate : undefined;
}

function internalAccountID(
  value: string | string[] | undefined,
): string | undefined {
  const candidate = firstValue(value)?.trim().toLowerCase();
  return candidate
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)
    ? candidate
    : undefined;
}

function shortID(value: string | null): string {
  return value ? `${value.slice(0, 8)}…` : "—";
}

function dateLabel(value: string | number | null): string {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value * 1_000) : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function subscriptionDetail(input: {
  owner: boolean;
  paid: boolean;
  status: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}): string {
  if (input.owner) return "Unlimited";
  if (!input.paid) return "Free tier";
  const periodEnd = dateLabel(input.currentPeriodEnd);
  if (input.cancelAtPeriodEnd) return `Ends ${periodEnd}`;
  if (input.status === "trialing") return `Trial through ${periodEnd}`;
  return `Renews ${periodEnd}`;
}

function bypassUserIDs(): Set<string> {
  return new Set(
    (runtime().BILLING_BYPASS_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

type StatusTone = "good" | "neutral" | "warning" | "bad";

function providerStatus(
  configured: boolean,
  live: ProviderProbe | null,
): { label: string; tone: StatusTone } {
  if (!configured) return { label: "Not configured", tone: "bad" };
  if (!live) return { label: "Configured", tone: "neutral" };
  return live.ok
    ? { label: "Connected", tone: "good" }
    : { label: `Failed · ${live.status}`, tone: "bad" };
}

function stripeStatus(
  configured: boolean,
  live: LiveProviderHealth["stripe"] | null,
  expectsLiveMode: boolean,
): { label: string; tone: StatusTone } {
  const base = providerStatus(configured, live);
  if (!live?.ok) return base;
  if (live.livemode !== expectsLiveMode) {
    return {
      label: live.livemode
        ? "Wrong mode · Live"
        : "Wrong mode · Test",
      tone: "bad",
    };
  }
  if (!live.active || live.interval !== "month") {
    return {
      label: `${expectsLiveMode ? "Live" : "Test"} · Price needs review`,
      tone: "warning",
    };
  }
  return {
    label: `${expectsLiveMode ? "Live" : "Test"} · Monthly`,
    tone: "good",
  };
}

function stripeWebhookStatus(
  configured: boolean,
  live: LiveProviderHealth["stripeWebhook"] | null,
): { label: string; tone: StatusTone } {
  const base = providerStatus(configured, live);
  if (!live || live.ok || live.status !== 200) return base;
  return { label: "Endpoint missing", tone: "bad" };
}

function dateTimeLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "just now"
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function durationLabel(milliseconds: number | null): string {
  if (milliseconds === null) return "—";
  if (milliseconds < 1_000) return `${milliseconds.toLocaleString()} ms`;
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
}

function costLabel(microUSD: number): string {
  const dollars = microUSD / 1_000_000;
  if (dollars === 0) return "$0.0000";
  if (dollars < 0.0001) return "<$0.0001";
  return `$${dollars.toFixed(dollars < 0.01 ? 4 : 2)}`;
}

function modelLabel(model: string): string {
  return model.replace("gpt-5.6-", "").replace(/^./, (value) =>
    value.toUpperCase()
  );
}

function operationLabel(operation: string): string {
  const labels: Record<string, string> = {
    answer: "Live answer",
    prep_answer: "Prep answer",
    vision: "Screenshot",
    context_prepare: "Prepare Context",
    state_seed: "Seed State",
    state_update: "State update",
    role_guidance: "Role guidance",
    reply_check: "Reply check",
  };
  return labels[operation] ?? operation.replaceAll("_", " ");
}

function metricStatusTone(status: string): StatusTone {
  if (status === "completed") return "good";
  if (status === "cancelled" || status === "incomplete" || status === "ended") {
    return "warning";
  }
  return "bad";
}

function diagnosticStatusTone(status: string): StatusTone {
  if (status === "completed" || status.startsWith("submitted")) return "good";
  if (status === "discarded_silence" || status === "empty") return "neutral";
  if (status.startsWith("discarded_") || status === "language_review") {
    return "warning";
  }
  return "bad";
}

function signalLabel(partsPerMillion: number | null): string {
  return partsPerMillion === null
    ? "—"
    : (partsPerMillion / 1_000_000).toFixed(3);
}

function transcriptionModelLabel(model: string): string {
  if (model === "deepgram-nova-3") return "Nova-3";
  if (model === "gpt-4o-transcribe") return "4o Transcribe";
  if (model === "gpt-4o-mini-transcribe") return "4o Mini";
  if (model === "gpt-realtime-whisper") return "Realtime Whisper";
  return model;
}

function DiagnosticFactList({
  title,
  facts,
}: {
  title: string;
  facts: InternalSessionDiagnosticFact[];
}) {
  return (
    <article className="internal-state-group">
      <header>
        <strong>{title}</strong>
        <span>{facts.length}</span>
      </header>
      {facts.length ? (
        <dl>
          {facts.map((fact) => (
            <div key={`${title}-${fact.key}`}>
              <dt>{fact.key}</dt>
              <dd>{fact.value}</dd>
              <small>{fact.status} · {fact.source}</small>
            </div>
          ))}
        </dl>
      ) : <p>No facts in this scope.</p>}
    </article>
  );
}

export default async function InternalConsolePage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string | string[];
    checks?: string | string[];
    depth?: string | string[];
    hours?: string | string[];
    metricPage?: string | string[];
    model?: string | string[];
    operation?: string | string[];
    page?: string | string[];
    diagnosticSession?: string | string[];
    status?: string | string[];
  }>;
}) {
  const cookieStore = await cookies();
  const principal = await internalAdminPrincipalForToken(
    cookieStore.get(internalSessionCookieName())?.value ?? null,
  );
  if (!principal) redirect("/internal/login/");

  const params = await searchParams;
  const page = parsePage(params.page);
  const metricsPage = parsePage(params.metricPage);
  const hours = metricHours(params.hours);
  const model = allowedValue(params.model, METRIC_MODELS);
  const operation = allowedValue(params.operation, METRIC_OPERATIONS);
  const depth = allowedValue(params.depth, METRIC_DEPTHS);
  const metricStatus = allowedValue(params.status, METRIC_STATUSES);
  const selectedAccountID = internalAccountID(params.account);
  const selectedAccountKey = selectedAccountID
    ? await pseudonymousIdentifier(`answer-metric:${selectedAccountID}`)
    : undefined;
  const requestedDiagnosticSession = diagnosticSessionKey(
    params.diagnosticSession,
  );
  const checksValue = Array.isArray(params.checks) ? params.checks[0] : params.checks;
  const shouldRunProviderChecks = checksValue === "live";
  const metricFilters = {
    hours,
    model,
    operation,
    accountKey: selectedAccountKey,
    depth,
    status: metricStatus,
  };
  const env = runtime();
  const deployment = deploymentEnvironment(env);
  const [
    directory,
    providerHealth,
    answerMetricPage,
    answerMetricSummary,
    answerHealthSummary,
    usageSummary,
    transcriptionDiagnostics,
    diagnosticSnapshots,
  ] = await Promise.all([
    listInternalAuthUsers({ page, perPage: PAGE_SIZE }),
    shouldRunProviderChecks ? liveProviderProbes() : Promise.resolve(null),
    internalAnswerMetricsPage({
      ...metricFilters,
      page: metricsPage,
      perPage: METRIC_PAGE_SIZE,
    }),
    internalAnswerMetricsSummary(metricFilters),
    internalAnswerMetricsSummary({ hours: 24 }),
    internalUsageSummary(),
    recentInternalTranscriptionDiagnostics({ hours: 24, limit: 500 }),
    deployment === "production"
      ? Promise.resolve([])
      : recentInternalSessionDiagnosticSnapshots({ limit: 250 }),
  ]);
  const pageCount = Math.max(1, Math.ceil(directory.total / PAGE_SIZE));
  const metricPageCount = Math.max(
    1,
    Math.ceil(answerMetricPage.total / METRIC_PAGE_SIZE),
  );
  if (page > pageCount || metricsPage > metricPageCount) {
    const correctedPage = Math.min(page, pageCount);
    const correctedMetricPage = Math.min(metricsPage, metricPageCount);
    const query = new URLSearchParams();
    if (correctedPage > 1) query.set("page", String(correctedPage));
    if (correctedMetricPage > 1) {
      query.set("metricPage", String(correctedMetricPage));
    }
    if (hours !== 24) query.set("hours", String(hours));
    if (model) query.set("model", model);
    if (operation) query.set("operation", operation);
    if (selectedAccountID) query.set("account", selectedAccountID);
    if (depth) query.set("depth", depth);
    if (metricStatus) query.set("status", metricStatus);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    redirect(`/internal/${suffix}#${page > pageCount ? "accounts" : "model-calls"}`);
  }
  const userIDs = directory.users.map((user) => user.id);
  const hasMetricNavigation = Boolean(
    metricsPage > 1
      || hours !== 24
      || model
      || operation
      || selectedAccountID
      || depth
      || metricStatus,
  );
  const sessionKeys = [...new Set(
    diagnosticSnapshots.map((snapshot) => snapshot.session_key),
  )];
  const selectedDiagnosticSession = requestedDiagnosticSession &&
      sessionKeys.includes(requestedDiagnosticSession)
    ? requestedDiagnosticSession
    : sessionKeys[0];
  const selectedDiagnosticSnapshots = selectedDiagnosticSession
    ? diagnosticSnapshots.filter(
        (snapshot) => snapshot.session_key === selectedDiagnosticSession,
      )
    : [];
  const latestDiagnosticSnapshot = selectedDiagnosticSnapshots[0] ?? null;
  const timelineByTurn = new Map<
    string,
    typeof diagnosticSnapshots[number]["recent_turns"][number]
  >();
  for (const snapshot of [...selectedDiagnosticSnapshots].reverse()) {
    for (const turn of snapshot.recent_turns) {
      timelineByTurn.set(turn.turnId, turn);
    }
  }
  const diagnosticTimeline = [...timelineByTurn.values()];
  const [accounts, usage, audit] = await Promise.all([
    internalAccountsFor(userIDs),
    internalMonthlyUsageFor(userIDs),
    recentInternalAuditEvents(16),
    insertInternalAuditEvent({
      adminUserId: principal.userId,
      action: shouldRunProviderChecks
        ? "provider_health_checked"
        : selectedDiagnosticSession
          ? "session_diagnostics_viewed"
        : hasMetricNavigation
          ? "answer_metrics_viewed"
          : "console_viewed",
      targetUserId: selectedAccountID ?? null,
      pageNumber: hasMetricNavigation ? metricsPage : page,
    }),
  ]);
  const accountsByUser = new Map(accounts.map((row) => [row.user_id, row]));
  const usageByUser = new Map(usage.map((row) => [row.user_id, row]));
  const ownerIDs = bypassUserIDs();
  const adminIDs = configuredInternalAdminUserIDs();
  const deploymentLabel = deployment === "production"
    ? "Production"
    : deployment === "preview"
      ? "Preview"
      : "Development";
  const expectsLiveBilling = deployment === "production";
  const siteURL = publicSiteURL(env);
  const siteTargetIsExpected = deployment === "production"
    ? siteURL === "https://cueaside.com"
    : siteURL !== "https://cueaside.com";
  const shownStart = directory.users.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const shownEnd = (page - 1) * PAGE_SIZE + directory.users.length;
  const firstReadableP95 = answerMetricSummary.first_readable_p95_ms;
  const durationP95 = answerMetricSummary.duration_p95_ms;
  const answerCostMicroUSD = answerMetricSummary.estimated_cost_micro_usd;
  const completionPercent = answerMetricSummary.total_calls
    ? Math.round(
        answerMetricSummary.completed_calls
          / answerMetricSummary.total_calls
          * 100,
      )
    : 0;
  const failurePercent = answerMetricSummary.total_calls
    ? Math.round(
        answerMetricSummary.failed_calls / answerMetricSummary.total_calls * 100,
      )
    : 0;
  const healthFailurePercent = answerHealthSummary.total_calls
    ? Math.round(
        answerHealthSummary.failed_calls / answerHealthSummary.total_calls * 100,
      )
    : 0;
  const selectedAccount = selectedAccountID
    ? directory.users.find((user) => user.id.toLowerCase() === selectedAccountID)
    : undefined;
  const transcriptionCaptures = transcriptionDiagnostics.filter(
    (metric) => metric.kind === "capture",
  );
  const submittedCaptures = transcriptionCaptures.filter(
    (metric) => metric.disposition.startsWith("submitted"),
  );
  const discardedCaptures = transcriptionCaptures.filter(
    (metric) => metric.disposition.startsWith("discarded_"),
  );
  const transcriptionResults = transcriptionDiagnostics.filter(
    (metric) => metric.kind === "result",
  );
  const completedTranscriptions = transcriptionResults.filter(
    (metric) => metric.disposition === "completed",
  );
  const reviewedTranscriptions = transcriptionResults.filter(
    (metric) => metric.disposition !== "completed",
  );
  const metricShownStart = answerMetricPage.rows.length
    ? (metricsPage - 1) * METRIC_PAGE_SIZE + 1
    : 0;
  const metricShownEnd = (metricsPage - 1) * METRIC_PAGE_SIZE
    + answerMetricPage.rows.length;
  const consoleHref = (input: {
    accountID?: string | null;
    accountPage?: number;
    metricPage?: number;
    checks?: "live";
    diagnosticSession?: string;
    hash?: string;
    resetMetrics?: boolean;
  } = {}): string => {
    const query = new URLSearchParams();
    const targetAccountPage = input.accountPage ?? page;
    const targetMetricPage = input.metricPage ?? metricsPage;
    if (targetAccountPage > 1) query.set("page", String(targetAccountPage));
    if (!input.resetMetrics) {
      if (targetMetricPage > 1) query.set("metricPage", String(targetMetricPage));
      if (hours !== 24) query.set("hours", String(hours));
      if (model) query.set("model", model);
      if (operation) query.set("operation", operation);
      const targetAccountID = input.accountID === undefined
        ? selectedAccountID
        : input.accountID;
      if (targetAccountID) query.set("account", targetAccountID);
      if (depth) query.set("depth", depth);
      if (metricStatus) query.set("status", metricStatus);
    }
    if (input.checks) query.set("checks", input.checks);
    const targetDiagnosticSession = input.diagnosticSession
      ?? selectedDiagnosticSession;
    if (targetDiagnosticSession) {
      query.set("diagnosticSession", targetDiagnosticSession);
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return `/internal/${suffix}${input.hash ? `#${input.hash}` : ""}`;
  };
  const shapes = providerShapeChecks(env);
  const providerRows = [
    {
      name: "Supabase Auth",
      note: "Sign-in and session service",
      status: providerStatus(
        shapes.SUPABASE_URL.ok &&
          shapes.SUPABASE_ANON_KEY.ok &&
          shapes.SUPABASE_ENVIRONMENT.ok,
        providerHealth?.supabaseAuth ?? null,
      ),
    },
    {
      name: "Supabase Admin",
      note: "Accounts, usage, and billing data",
      status: providerStatus(
        shapes.SUPABASE_URL.ok &&
          shapes.SUPABASE_SERVICE_ROLE_KEY.ok &&
          shapes.SUPABASE_ENVIRONMENT.ok,
        providerHealth?.supabaseAdmin ?? null,
      ),
    },
    {
      name: "Stripe",
      note: "Recurring monthly Price",
      status: stripeStatus(
        shapes.STRIPE_SECRET_KEY.ok && shapes.STRIPE_PRICE_ID.ok,
        providerHealth?.stripe ?? null,
        expectsLiveBilling,
      ),
    },
    {
      name: "Stripe Webhook",
      note: `${deploymentLabel} entitlement updates`,
      status: stripeWebhookStatus(
        shapes.STRIPE_WEBHOOK_SECRET.ok,
        providerHealth?.stripeWebhook ?? null,
      ),
    },
    {
      name: "OpenAI",
      note: "Answers and fallback transcription",
      status: providerStatus(
        shapes.OPENAI_API_KEY.ok,
        providerHealth?.openai ?? null,
      ),
    },
    {
      name: "Deepgram",
      note: "Short-lived realtime transcription tokens",
      status: providerStatus(
        shapes.DEEPGRAM_API_KEY.ok,
        providerHealth?.deepgram ?? null,
      ),
    },
  ];
  const monitoringRows = [
    {
      name: "Web Analytics",
      note: "Anonymous visits and traffic sources",
      status: { label: "Installed", tone: "good" as const },
    },
    {
      name: "Speed Insights",
      note: "Real-user Core Web Vitals",
      status: { label: "Installed", tone: "good" as const },
    },
    {
      name: "Server Sentry",
      note: "Content-free API and server errors",
      status: providerStatus(Boolean(env.SENTRY_DSN?.trim()), null),
    },
    {
      name: "Browser Sentry",
      note: "Content-free website errors",
      status: providerStatus(Boolean(env.NEXT_PUBLIC_SENTRY_DSN?.trim()), null),
    },
    {
      name: "Live health probe",
      note: "Token-gated external uptime check",
      status: providerStatus(
        (env.HEALTH_PROBE_TOKEN?.trim().length ?? 0) >= 32,
        null,
      ),
    },
    {
      name: "Public site URL",
      note: siteURL,
      status: {
        label: siteTargetIsExpected
          ? "Environment-specific"
          : deployment === "production"
            ? "Wrong target"
            : "Not isolated",
        tone: siteTargetIsExpected ? "good" as const : "bad" as const,
      },
    },
  ];
  const operationalAlerts: Array<{
    title: string;
    detail: string;
    tone: "warning" | "bad";
  }> = [];
  if (answerHealthSummary.total_calls >= 10 && healthFailurePercent >= 5) {
    operationalAlerts.push({
      title: "Model-call failures are elevated",
      detail: `${healthFailurePercent}% of all calls failed in the last 24 hours. Filter by operation and status before changing routing.`,
      tone: healthFailurePercent >= 10 ? "bad" : "warning",
    });
  }
  if ((answerHealthSummary.first_readable_p95_ms ?? 0) > 10_000) {
    operationalAlerts.push({
      title: "First-readable latency is high",
      detail: `p95 is ${durationLabel(answerHealthSummary.first_readable_p95_ms)} across all calls in the last 24 hours.`,
      tone: (answerHealthSummary.first_readable_p95_ms ?? 0) > 15_000
        ? "bad"
        : "warning",
    });
  }
  if (
    transcriptionResults.length >= 10
    && reviewedTranscriptions.length / transcriptionResults.length >= 0.1
  ) {
    operationalAlerts.push({
      title: "Transcription review rate is elevated",
      detail: `${reviewedTranscriptions.length} of ${transcriptionResults.length} recent results were empty, failed, cancelled, or flagged for language review.`,
      tone: "warning",
    });
  }
  const unreadyProviders = providerRows.filter(
    (row) => row.status.tone === "bad",
  );
  if (unreadyProviders.length > 0) {
    operationalAlerts.push({
      title: "Provider setup needs attention",
      detail: unreadyProviders.map((row) => row.name).join(", "),
      tone: "bad",
    });
  }

  return (
    <main className="internal-console-shell">
      <aside className="internal-sidebar">
        <div>
          <div className="internal-console-brand">
            <span aria-hidden="true">C</span>
            <div>
              <strong>CueAside</strong>
              <small>Console</small>
            </div>
          </div>
          <nav aria-label="Console sections">
            <a className="is-active" href="#accounts">Accounts</a>
            {deployment !== "production" ? (
              <>
                <a href="#session-timeline">Sessions</a>
                <a href="#state-inspector">State</a>
              </>
            ) : null}
            <a href="#transcription-diagnostics">Transcription</a>
            <a href="#model-calls">Model calls</a>
            <a href="#providers">Provider health</a>
            <a href="#monitoring">Monitoring</a>
            <a href="#audit">Access audit</a>
            <a href="#boundary">Privacy boundary</a>
          </nav>
        </div>
        <form action="/api/internal/auth/logout/" method="post">
          <span title={principal.userId}>{shortID(principal.userId)}</span>
          <button type="submit">Log out</button>
        </form>
      </aside>

      <div className="internal-console-main">
        <header className="internal-console-header">
          <div>
            <p className="internal-kicker">Operations overview</p>
            <h1>Accounts and performance</h1>
            {deployment === "production" ? (
              <p>
                Read-only production account data. No audio, transcripts,
                prompts, answers, Context, or Project State.
              </p>
            ) : (
              <p>
                Read-only {deploymentLabel.toLowerCase()} operations plus
                short-lived diagnostics from an authenticated admin&rsquo;s
                development build. Diagnostic content expires after seven days.
              </p>
            )}
          </div>
          <span className={`internal-live-badge is-${deployment}`}>
            <i /> {deploymentLabel}
          </span>
        </header>

        <section className="internal-stat-grid" aria-label="Account summary">
          <article>
            <span>Total accounts</span>
            <strong>{directory.total.toLocaleString()}</strong>
            <small>Supabase identities</small>
          </article>
          <article>
            <span>Paid accounts</span>
            <strong>{usageSummary.active_subscriptions.toLocaleString()}</strong>
            <small>
              {usageSummary.trialing_subscriptions.toLocaleString()} trialing · {usageSummary.canceling_subscriptions.toLocaleString()} canceling
            </small>
          </article>
          <article>
            <span>Monthly active</span>
            <strong>{usageSummary.monthly_active_accounts.toLocaleString()}</strong>
            <small>Accounts with metered activity</small>
          </article>
          <article>
            <span>Answers this month</span>
            <strong>{usageSummary.answer_requests.toLocaleString()}</strong>
            <small>All accounts</small>
          </article>
          <article>
            <span>Transcriptions</span>
            <strong>{usageSummary.transcription_requests.toLocaleString()}</strong>
            <small>File and fallback requests</small>
          </article>
          <article>
            <span>Live minutes</span>
            <strong>{(usageSummary.realtime_tokens * 4).toLocaleString()}</strong>
            <small>{adminIDs.size} Console admin{adminIDs.size === 1 ? "" : "s"}</small>
          </article>
        </section>

        <section
          className={`internal-alert-strip ${operationalAlerts.length === 0 ? "is-clear" : ""}`}
          aria-label="Operational alerts"
        >
          <div>
            <p className="internal-kicker">Needs attention</p>
            <h2>{operationalAlerts.length === 0 ? "No active Console alerts" : `${operationalAlerts.length} active alert${operationalAlerts.length === 1 ? "" : "s"}`}</h2>
          </div>
          <div className="internal-alert-list">
            {operationalAlerts.length === 0 ? (
              <p>Account usage, model latency, failures, transcription results, and provider configuration are within the current guardrails.</p>
            ) : operationalAlerts.map((alert) => (
              <article className={`is-${alert.tone}`} key={alert.title}>
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
              </article>
            ))}
          </div>
        </section>

        {deployment !== "production" ? (
          <>
            <section className="internal-panel" id="session-timeline">
              <div className="internal-panel-head">
                <div>
                  <p className="internal-kicker">Development only · 7-day retention</p>
                  <h2>Session timeline</h2>
                </div>
                <span>{sessionKeys.length} diagnostic sessions</span>
              </div>
              <div className="internal-session-picker" aria-label="Diagnostic sessions">
                {sessionKeys.map((sessionKey, index) => (
                  <Link
                    className={sessionKey === selectedDiagnosticSession ? "is-selected" : ""}
                    href={consoleHref({
                      diagnosticSession: sessionKey,
                      hash: "session-timeline",
                    })}
                    key={sessionKey}
                  >
                    Session {sessionKeys.length - index}
                    <small>{sessionKey.slice(0, 10)}…</small>
                  </Link>
                ))}
              </div>
              {latestDiagnosticSnapshot ? (
                <>
                  <div className="internal-diagnostic-meta">
                    <span>
                      <strong>Project</strong>
                      {latestDiagnosticSnapshot.active_project_id}
                    </span>
                    <span>
                      <strong>Last snapshot</strong>
                      {dateTimeLabel(latestDiagnosticSnapshot.recorded_at)}
                    </span>
                    <span>
                      <strong>State input</strong>
                      {latestDiagnosticSnapshot.estimated_input_tokens === null
                        ? "—"
                        : `${latestDiagnosticSnapshot.estimated_input_tokens.toLocaleString()} estimated tokens`}
                    </span>
                  </div>
                  <ol className="internal-session-timeline">
                    {diagnosticTimeline.map((turn, index) => (
                      <li key={turn.turnId}>
                        <span>{index + 1}</span>
                        <div>
                          <small>Question</small>
                          <p>{turn.question}</p>
                          <small>Suggested answer</small>
                          <p>{turn.suggestedAnswer}</p>
                          <small>Actually spoken</small>
                          <p className={turn.spokenReply ? "" : "is-empty"}>
                            {turn.spokenReply || "Not captured yet"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {diagnosticTimeline.length === 0 ? (
                    <p className="internal-empty-row">No conversation turns in this snapshot.</p>
                  ) : null}
                </>
              ) : (
                <p className="internal-empty-row">
                  No development diagnostic snapshots have been received yet.
                </p>
              )}
            </section>

            <section className="internal-panel" id="state-inspector">
              <div className="internal-panel-head">
                <div>
                  <p className="internal-kicker">Selected diagnostic session</p>
                  <h2>State Inspector</h2>
                </div>
                <span>
                  {latestDiagnosticSnapshot
                    ? `Updated ${dateTimeLabel(
                        latestDiagnosticSnapshot.state_updated_at
                          ?? latestDiagnosticSnapshot.recorded_at,
                      )}`
                    : "Waiting for a snapshot"}
                </span>
              </div>
              {latestDiagnosticSnapshot ? (
                <>
                  <div className="internal-state-grid">
                    <DiagnosticFactList
                      title="Seed facts"
                      facts={latestDiagnosticSnapshot.seed_facts}
                    />
                    <DiagnosticFactList
                      title="Canonical project facts"
                      facts={latestDiagnosticSnapshot.canonical_facts}
                    />
                    <DiagnosticFactList
                      title="Temporary claims"
                      facts={latestDiagnosticSnapshot.temporary_claims}
                    />
                    <DiagnosticFactList
                      title="Foreign project mentions"
                      facts={latestDiagnosticSnapshot.foreign_project_mentions}
                    />
                  </div>
                  <article className="internal-state-group internal-scenario-state">
                    <header>
                      <strong>Scenario state</strong>
                      <span>{latestDiagnosticSnapshot.scenario_state?.facts.length ?? 0}</span>
                    </header>
                    {latestDiagnosticSnapshot.scenario_state ? (
                      <>
                        <p>
                          <strong>{latestDiagnosticSnapshot.scenario_state.id}</strong>
                          {latestDiagnosticSnapshot.scenario_state.triggerQuestion
                            ? ` · ${latestDiagnosticSnapshot.scenario_state.triggerQuestion}`
                            : ""}
                        </p>
                        <DiagnosticFactList
                          title="Scenario facts"
                          facts={latestDiagnosticSnapshot.scenario_state.facts}
                        />
                      </>
                    ) : <p>No active hypothetical scenario.</p>}
                  </article>
                  <article className="internal-state-group internal-rejected-state">
                    <header>
                      <strong>Rejected claims</strong>
                      <span>
                        {latestDiagnosticSnapshot.rejected_claims.conflicts.length
                          + latestDiagnosticSnapshot.rejected_claims.projectMismatches.length
                          + latestDiagnosticSnapshot.rejected_claims.invalid.length}
                      </span>
                    </header>
                    <dl>
                      <div>
                        <dt>Conflicts</dt>
                        <dd>{latestDiagnosticSnapshot.rejected_claims.conflicts.join(", ") || "None"}</dd>
                      </div>
                      <div>
                        <dt>Project mismatches</dt>
                        <dd>{latestDiagnosticSnapshot.rejected_claims.projectMismatches.join(", ") || "None"}</dd>
                      </div>
                      <div>
                        <dt>Invalid</dt>
                        <dd>{latestDiagnosticSnapshot.rejected_claims.invalid.join(", ") || "None"}</dd>
                      </div>
                    </dl>
                  </article>
                </>
              ) : (
                <p className="internal-empty-row">
                  State remains local until an admin uses a non-Production
                  development build connected to this isolated environment.
                </p>
              )}
            </section>
          </>
        ) : null}

        <section
          className="internal-panel internal-metrics-panel"
          id="transcription-diagnostics"
        >
          <div className="internal-panel-head">
            <div>
              <p className="internal-kicker">Last 24 hours</p>
              <h2>Transcription diagnostics</h2>
            </div>
            <span>Latest {transcriptionDiagnostics.length.toLocaleString()} of 500</span>
          </div>
          <div
            className="internal-metric-grid"
            aria-label="Transcription diagnostic summary"
          >
            <article>
              <span>Submitted segments</span>
              <strong>{submittedCaptures.length.toLocaleString()}</strong>
              <small>Passed the local signal gate</small>
            </article>
            <article>
              <span>Discarded locally</span>
              <strong>{discardedCaptures.length.toLocaleString()}</strong>
              <small>Silence, too short, or write failure</small>
            </article>
            <article>
              <span>Completed results</span>
              <strong>{completedTranscriptions.length.toLocaleString()}</strong>
              <small>Usable text returned to the app</small>
            </article>
            <article>
              <span>Needs review</span>
              <strong>{reviewedTranscriptions.length.toLocaleString()}</strong>
              <small>Empty, failed, cancelled, or language hold</small>
            </article>
          </div>
          <div className="internal-table-wrap">
            <table className="internal-table internal-metrics-table">
              <thead>
                <tr>
                  <th>Stream</th>
                  <th>Kind</th>
                  <th>Signal / voiced</th>
                  <th>Peak / threshold</th>
                  <th>Path</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {transcriptionDiagnostics.slice(0, 20).map((metric) => (
                  <tr key={metric.id}>
                    <td>
                      <strong>
                        {metric.stream_role === "spoken_reply" ? "Your reply" : "Question"}
                      </strong>
                      <small>{dateTimeLabel(metric.recorded_at)}</small>
                    </td>
                    <td>{metric.kind === "capture" ? "Signal" : "Result"}</td>
                    <td>
                      {metric.duration_ms === null
                        ? "—"
                        : `${durationLabel(metric.duration_ms)} / ${durationLabel(metric.voiced_ms)}`}
                    </td>
                    <td>
                      {signalLabel(metric.peak_rms_ppm)} / {signalLabel(metric.silence_threshold_ppm)}
                    </td>
                    <td>
                      <strong>{transcriptionModelLabel(metric.model)}</strong>
                      <small>
                        {metric.delivery} · {metric.language.toUpperCase()} · {metric.capture_source}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`internal-provider-status is-${diagnosticStatusTone(metric.disposition)}`}
                      >
                        <i aria-hidden="true" />
                        {metric.disposition.replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
                {transcriptionDiagnostics.length === 0 ? (
                  <tr>
                    <td className="internal-empty-row" colSpan={6}>
                      No content-free transcription diagnostics have been recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="internal-provider-footnote">
            Signal duration, voiced duration, peak, threshold, model, language,
            and closed outcomes are retained for 30 days. Audio and words are never stored.
          </p>
        </section>

        <section className="internal-panel internal-metrics-panel" id="model-calls">
          <div className="internal-panel-head">
            <div>
              <p className="internal-kicker">
                {hours === 24 ? "Last 24 hours" : hours === 168 ? "Last 7 days" : "Last 30 days"}
              </p>
              <h2>Answer performance</h2>
              {selectedAccountID ? (
                <p className="internal-filter-context">
                  Account: {selectedAccount?.email ?? shortID(selectedAccountID)}
                </p>
              ) : null}
            </div>
            <span>
              {metricShownStart}–{metricShownEnd} of {answerMetricPage.total.toLocaleString()}
            </span>
          </div>
          <form className="internal-metric-filters" method="get" action="/internal/">
            {page > 1 ? <input type="hidden" name="page" value={page} /> : null}
            {selectedAccountID ? (
              <input type="hidden" name="account" value={selectedAccountID} />
            ) : null}
            <label>
              <span>Window</span>
              <select name="hours" defaultValue={String(hours)}>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
                <option value="720">30 days</option>
              </select>
            </label>
            <label>
              <span>Operation</span>
              <select name="operation" defaultValue={operation ?? "all"}>
                <option value="all">All operations</option>
                <option value="answer">Live answer</option>
                <option value="prep_answer">Prep answer</option>
                <option value="vision">Screenshot</option>
                <option value="context_prepare">Prepare Context</option>
                <option value="state_seed">Seed State</option>
                <option value="state_update">State update</option>
                <option value="role_guidance">Role guidance</option>
                <option value="reply_check">Reply check</option>
              </select>
            </label>
            <label>
              <span>Model</span>
              <select name="model" defaultValue={model ?? "all"}>
                <option value="all">All models</option>
                <option value="gpt-5.6-luna">Luna</option>
                <option value="gpt-5.6-terra">Terra</option>
                <option value="gpt-5.6-sol">Sol</option>
              </select>
            </label>
            <label>
              <span>Depth</span>
              <select name="depth" defaultValue={depth ?? "all"}>
                <option value="all">All depths</option>
                <option value="instinct">Instinct</option>
                <option value="balanced">Balanced</option>
                <option value="precise">Precise</option>
                <option value="thinking">Thinking</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue={metricStatus ?? "all"}>
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="incomplete">Incomplete</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
                <option value="stream_error">Stream error</option>
                <option value="ended">Ended</option>
              </select>
            </label>
            <div>
              <button type="submit">Apply</button>
              <Link href={consoleHref({ resetMetrics: true, hash: "model-calls" })}>
                Reset
              </Link>
            </div>
          </form>
          <div className="internal-metric-grid" aria-label="Answer performance summary">
            <article>
              <span>Calls</span>
              <strong>{answerMetricSummary.total_calls.toLocaleString()}</strong>
              <small>{completionPercent}% completed · {failurePercent}% failed</small>
            </article>
            <article>
              <span>First readable p95</span>
              <strong>{durationLabel(firstReadableP95)}</strong>
              <small>Completed streams</small>
            </article>
            <article>
              <span>Total time p95</span>
              <strong>{durationLabel(durationP95)}</strong>
              <small>Completed streams</small>
            </article>
            <article>
              <span>Estimated cost</span>
              <strong>{costLabel(answerCostMicroUSD)}</strong>
              <small>All matched calls</small>
            </article>
          </div>
          <div className="internal-table-wrap">
            <table className="internal-table internal-metrics-table">
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Model</th>
                  <th>Depth</th>
                  <th>Tier</th>
                  <th>First readable</th>
                  <th>Total</th>
                  <th>Input / output</th>
                  <th>Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {answerMetricPage.rows.map((metric) => (
                  <tr key={metric.id}>
                    <td>
                      <strong>{operationLabel(metric.operation)}</strong>
                      <small>
                        {metric.account_key
                          ? selectedAccount?.email ?? `Account ${metric.account_key.slice(0, 8)}…`
                          : "Legacy aggregate"}
                      </small>
                    </td>
                    <td>
                      <strong>{modelLabel(metric.model)}</strong>
                      <small>{dateTimeLabel(metric.recorded_at)}</small>
                    </td>
                    <td>{modelLabel(metric.depth)}</td>
                    <td>{metric.service_tier === "fast" ? "Fast" : "Standard"}</td>
                    <td>{durationLabel(metric.first_readable_ms)}</td>
                    <td>{durationLabel(metric.duration_ms)}</td>
                    <td>
                      {metric.input_tokens.toLocaleString()} / {metric.output_tokens.toLocaleString()}
                    </td>
                    <td>{costLabel(metric.estimated_cost_micro_usd)}</td>
                    <td>
                      <span className={`internal-provider-status is-${metricStatusTone(metric.status)}`}>
                        <i aria-hidden="true" />
                        {metric.status.replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
                {answerMetricPage.rows.length === 0 ? (
                  <tr>
                    <td className="internal-empty-row" colSpan={9}>
                      No content-free answer metrics have been recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="internal-pagination">
            {metricsPage > 1 ? (
              <Link href={consoleHref({ metricPage: metricsPage - 1, hash: "model-calls" })}>
                Previous
              </Link>
            ) : <span />}
            <span>Page {metricsPage} of {metricPageCount}</span>
            {metricsPage < metricPageCount ? (
              <Link href={consoleHref({ metricPage: metricsPage + 1, hash: "model-calls" })}>
                Next
              </Link>
            ) : <span />}
          </div>
          <p className="internal-provider-footnote">
            Retained for 30 days. Calls are linked with a one-way account key;
            no account ID, question, answer, prompt, transcript, Context,
            Project State, or provider body is stored.
          </p>
        </section>

        <section className="internal-panel internal-provider-panel" id="monitoring">
          <div className="internal-panel-head">
            <div>
              <p className="internal-kicker">Observability</p>
              <h2>Monitoring readiness</h2>
            </div>
          </div>
          <div className="internal-provider-grid">
            {monitoringRows.map((item) => (
              <article key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.note}</small>
                </div>
                <span className={`internal-provider-status is-${item.status.tone}`}>
                  <i aria-hidden="true" />
                  {item.status.label}
                </span>
              </article>
            ))}
          </div>
          <p className="internal-provider-footnote">
            Installed means the client instrumentation ships with this deployment.
            Configured services still need one real dashboard event before launch.
          </p>
        </section>

        <section className="internal-panel internal-provider-panel" id="providers">
          <div className="internal-panel-head">
            <div>
              <p className="internal-kicker">Infrastructure</p>
              <h2>Provider health</h2>
            </div>
            <Link
              className="internal-check-button"
              href={consoleHref({ checks: "live", hash: "providers" })}
            >
              Run live checks
            </Link>
          </div>
          <div className="internal-provider-grid">
            {providerRows.map((provider) => (
              <article key={provider.name}>
                <div>
                  <strong>{provider.name}</strong>
                  <small>{provider.note}</small>
                </div>
                <span className={`internal-provider-status is-${provider.status.tone}`}>
                  <i aria-hidden="true" />
                  {provider.status.label}
                </span>
              </article>
            ))}
          </div>
          <p className="internal-provider-footnote">
            {providerHealth
              ? `Checked ${dateTimeLabel(providerHealth.checkedAt)} from the deployed server. No credential values are returned or stored.`
              : "Configured means the deployed value has the expected shape. Run live checks to verify the providers without downloading credentials."}
          </p>
        </section>

        <section className="internal-panel" id="accounts">
          <div className="internal-panel-head">
            <div>
              <p className="internal-kicker">Directory</p>
              <h2>Customer accounts</h2>
            </div>
            <span>{shownStart}–{shownEnd} of {directory.total}</span>
          </div>
          <div className="internal-table-wrap">
            <table className="internal-table internal-accounts-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Plan</th>
                  <th>Answers</th>
                  <th>Transcriptions</th>
                  <th>Live minutes</th>
                  <th>Last sign-in</th>
                  <th>Model calls</th>
                </tr>
              </thead>
              <tbody>
                {directory.users.map((user) => {
                  const account = accountsByUser.get(user.id);
                  const counters = usageByUser.get(user.id);
                  const owner = ownerIDs.has(user.id.toLowerCase());
                  const paid = ACTIVE_STATUSES.has(
                    account?.subscription_status ?? "",
                  );
                  const plan = owner ? "Owner" : paid ? "Pro" : "Free";
                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.email ?? "Email unavailable"}</strong>
                        <small title={user.id}>
                          {shortID(user.id)} · joined {dateLabel(user.createdAt)}
                          {adminIDs.has(user.id.toLowerCase()) ? " · admin" : ""}
                        </small>
                      </td>
                      <td>
                        <span className={`internal-plan is-${plan.toLowerCase()}`}>{plan}</span>
                        <small className="internal-plan-detail">
                          {subscriptionDetail({
                            owner,
                            paid,
                            status: account?.subscription_status ?? null,
                            currentPeriodEnd: account?.current_period_end ?? null,
                            cancelAtPeriodEnd: account?.cancel_at_period_end ?? false,
                          })}
                        </small>
                      </td>
                      <td>{owner ? "Unlimited" : (counters?.answer_requests ?? 0)}</td>
                      <td>{owner ? "Unlimited" : (counters?.transcription_requests ?? 0)}</td>
                      <td>{owner ? "Unlimited" : (counters?.realtime_tokens ?? 0) * 4}</td>
                      <td>{dateLabel(user.lastSignInAt)}</td>
                      <td>
                        <Link
                          className="internal-row-action"
                          href={consoleHref({
                            accountID: user.id,
                            metricPage: 1,
                            hash: "model-calls",
                          })}
                        >
                          Inspect
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="internal-pagination">
            {page > 1 ? (
              <Link href={consoleHref({ accountPage: page - 1, hash: "accounts" })}>
                Previous
              </Link>
            ) : <span />}
            <span>Page {page} of {pageCount}</span>
            {page < pageCount ? (
              <Link href={consoleHref({ accountPage: page + 1, hash: "accounts" })}>
                Next
              </Link>
            ) : <span />}
          </div>
        </section>

        <div className="internal-lower-grid">
          <section className="internal-panel" id="audit">
            <div className="internal-panel-head">
              <div>
                <p className="internal-kicker">Security</p>
                <h2>Recent Console access</h2>
              </div>
            </div>
            <ul className="internal-audit-list">
              {audit.map((event) => (
                <li key={event.id}>
                  <span>{event.action.replaceAll("_", " ")}</span>
                  <small>{shortID(event.admin_user_id)} · {dateLabel(event.occurred_at)}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className="internal-panel internal-boundary" id="boundary">
            <div className="internal-panel-head">
              <div>
                <p className="internal-kicker">Hard boundary</p>
                <h2>{deployment === "production"
                  ? "What this Console cannot see"
                  : "Diagnostic privacy boundary"}</h2>
              </div>
            </div>
            <ul>
              <li>Audio or saved recordings</li>
              <li>{deployment === "production"
                ? "Questions, transcripts, or spoken replies"
                : "No diagnostic content from ordinary or Production builds"}</li>
              <li>{deployment === "production"
                ? "Generated answers or prompts"
                : "No full prompts, resume files, Context files, or screenshots"}</li>
              <li>{deployment === "production"
                ? "Context, Project State, or screenshots"
                : "No data after the seven-day diagnostic retention window"}</li>
            </ul>
            <p>{deployment === "production"
              ? "Those remain on the user’s Mac and are not sent to this database."
              : "Only the allowlisted admin’s bounded turns and structured State are accepted from a development build."}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
