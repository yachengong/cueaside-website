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
  internalAccountsFor,
  internalMonthlyUsageFor,
  listInternalAuthUsers,
  recentInternalAuditEvents,
  recentInternalTranscriptionDiagnostics,
} from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const METRIC_PAGE_SIZE = 20;
const METRIC_SUMMARY_LIMIT = 1_000;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

type MetricModel = "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";
type MetricDepth = "instinct" | "balanced" | "precise" | "thinking";
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

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ordered.length * fraction) - 1),
  );
  return ordered[index];
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

export default async function InternalConsolePage({
  searchParams,
}: {
  searchParams: Promise<{
    checks?: string | string[];
    depth?: string | string[];
    hours?: string | string[];
    metricPage?: string | string[];
    model?: string | string[];
    page?: string | string[];
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
  const depth = allowedValue(params.depth, METRIC_DEPTHS);
  const metricStatus = allowedValue(params.status, METRIC_STATUSES);
  const checksValue = Array.isArray(params.checks) ? params.checks[0] : params.checks;
  const shouldRunProviderChecks = checksValue === "live";
  const metricFilters = { hours, model, depth, status: metricStatus };
  const [
    directory,
    providerHealth,
    answerMetricPage,
    answerMetricSummary,
    transcriptionDiagnostics,
  ] = await Promise.all([
    listInternalAuthUsers({ page, perPage: PAGE_SIZE }),
    shouldRunProviderChecks ? liveProviderProbes() : Promise.resolve(null),
    internalAnswerMetricsPage({
      ...metricFilters,
      page: metricsPage,
      perPage: METRIC_PAGE_SIZE,
    }),
    internalAnswerMetricsPage({
      ...metricFilters,
      page: 1,
      perPage: METRIC_SUMMARY_LIMIT,
    }),
    recentInternalTranscriptionDiagnostics({ hours: 24, limit: 500 }),
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
    if (depth) query.set("depth", depth);
    if (metricStatus) query.set("status", metricStatus);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    redirect(`/internal/${suffix}#${page > pageCount ? "accounts" : "model-calls"}`);
  }
  const userIDs = directory.users.map((user) => user.id);
  const hasMetricNavigation = Boolean(
    metricsPage > 1 || hours !== 24 || model || depth || metricStatus,
  );
  const [accounts, usage, audit] = await Promise.all([
    internalAccountsFor(userIDs),
    internalMonthlyUsageFor(userIDs),
    recentInternalAuditEvents(16),
    insertInternalAuditEvent({
      adminUserId: principal.userId,
      action: shouldRunProviderChecks
        ? "provider_health_checked"
        : hasMetricNavigation
          ? "answer_metrics_viewed"
          : "console_viewed",
      pageNumber: hasMetricNavigation ? metricsPage : page,
    }),
  ]);
  const accountsByUser = new Map(accounts.map((row) => [row.user_id, row]));
  const usageByUser = new Map(usage.map((row) => [row.user_id, row]));
  const ownerIDs = bypassUserIDs();
  const adminIDs = configuredInternalAdminUserIDs();
  const env = runtime();
  const deployment = deploymentEnvironment(env);
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
  const activeCount = accounts.filter((row) =>
    ACTIVE_STATUSES.has(row.subscription_status),
  ).length;
  const answerMetrics = answerMetricSummary.rows;
  const completedAnswerMetrics = answerMetrics.filter(
    (metric) => metric.status === "completed",
  );
  const firstReadableP95 = percentile(
    completedAnswerMetrics.flatMap((metric) =>
      metric.first_readable_ms === null ? [] : [metric.first_readable_ms]
    ),
    0.95,
  );
  const durationP95 = percentile(
    completedAnswerMetrics.map((metric) => metric.duration_ms),
    0.95,
  );
  const answerCostMicroUSD = answerMetrics.reduce(
    (sum, metric) => sum + metric.estimated_cost_micro_usd,
    0,
  );
  const completionPercent = answerMetrics.length
    ? Math.round(completedAnswerMetrics.length / answerMetrics.length * 100)
    : 0;
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
    accountPage?: number;
    metricPage?: number;
    checks?: "live";
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
      if (depth) query.set("depth", depth);
      if (metricStatus) query.set("status", metricStatus);
    }
    if (input.checks) query.set("checks", input.checks);
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
            <p>
              Read-only {deploymentLabel.toLowerCase()} account data. No audio,
              transcripts, prompts,
              answers, Context, or Project State.
            </p>
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
            <span>Paid on this page</span>
            <strong>{activeCount}</strong>
            <small>Active or trialing</small>
          </article>
          <article>
            <span>Current month</span>
            <strong>{usage.reduce((sum, row) => sum + row.answer_requests, 0)}</strong>
            <small>Answer requests on this page</small>
          </article>
          <article>
            <span>Console admins</span>
            <strong>{adminIDs.size}</strong>
            <small>Server allowlist</small>
          </article>
        </section>

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
            </div>
            <span>
              {metricShownStart}–{metricShownEnd} of {answerMetricPage.total.toLocaleString()}
            </span>
          </div>
          <form className="internal-metric-filters" method="get" action="/internal/">
            {page > 1 ? <input type="hidden" name="page" value={page} /> : null}
            <label>
              <span>Window</span>
              <select name="hours" defaultValue={String(hours)}>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
                <option value="720">30 days</option>
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
              <strong>{answerMetricPage.total.toLocaleString()}</strong>
              <small>{completionPercent}% completed in sample</small>
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
              <small>
                {answerMetricPage.total > answerMetrics.length
                  ? `Latest ${answerMetrics.length.toLocaleString()} calls`
                  : "All matched calls"}
              </small>
            </article>
          </div>
          <div className="internal-table-wrap">
            <table className="internal-table internal-metrics-table">
              <thead>
                <tr>
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
                    <td className="internal-empty-row" colSpan={8}>
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
            Retained for 30 days. No account ID, question, answer, prompt,
            transcript, Context, Project State, or provider body is stored.
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
                <h2>What this Console cannot see</h2>
              </div>
            </div>
            <ul>
              <li>Audio or saved recordings</li>
              <li>Questions, transcripts, or spoken replies</li>
              <li>Generated answers or prompts</li>
              <li>Context, Project State, or screenshots</li>
            </ul>
            <p>Those remain on the user&rsquo;s Mac and are not sent to this database.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
