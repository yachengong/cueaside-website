import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  configuredInternalAdminUserIDs,
  internalAdminPrincipalForToken,
  internalSessionCookieName,
} from "@/lib/server/internal-auth";
import { runtime } from "@/lib/server/runtime";
import {
  liveProviderProbes,
  providerShapeChecks,
  type LiveProviderHealth,
  type ProviderProbe,
} from "@/lib/server/provider-health";
import {
  insertInternalAuditEvent,
  internalAccountsFor,
  internalMonthlyUsageFor,
  listInternalAuthUsers,
  recentInternalAuditEvents,
} from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

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
): { label: string; tone: StatusTone } {
  const base = providerStatus(configured, live);
  if (!live?.ok) return base;
  if (!live.livemode) return { label: "Connected · Test mode", tone: "warning" };
  if (!live.active || live.interval !== "month") {
    return { label: "Live · Price needs review", tone: "warning" };
  }
  return { label: "Live · Monthly", tone: "good" };
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

export default async function InternalConsolePage({
  searchParams,
}: {
  searchParams: Promise<{
    checks?: string | string[];
    page?: string | string[];
  }>;
}) {
  const cookieStore = await cookies();
  const principal = await internalAdminPrincipalForToken(
    cookieStore.get(internalSessionCookieName())?.value ?? null,
  );
  if (!principal) redirect("/internal/login/");

  const params = await searchParams;
  const page = parsePage(params.page);
  const checksValue = Array.isArray(params.checks) ? params.checks[0] : params.checks;
  const shouldRunProviderChecks = checksValue === "live";
  const [directory, providerHealth] = await Promise.all([
    listInternalAuthUsers({ page, perPage: PAGE_SIZE }),
    shouldRunProviderChecks ? liveProviderProbes() : Promise.resolve(null),
  ]);
  const userIDs = directory.users.map((user) => user.id);
  const [accounts, usage, audit] = await Promise.all([
    internalAccountsFor(userIDs),
    internalMonthlyUsageFor(userIDs),
    recentInternalAuditEvents(16),
    insertInternalAuditEvent({
      adminUserId: principal.userId,
      action: shouldRunProviderChecks
        ? "provider_health_checked"
        : "console_viewed",
      pageNumber: page,
    }),
  ]);
  const accountsByUser = new Map(accounts.map((row) => [row.user_id, row]));
  const usageByUser = new Map(usage.map((row) => [row.user_id, row]));
  const ownerIDs = bypassUserIDs();
  const adminIDs = configuredInternalAdminUserIDs();
  const pageCount = Math.max(1, Math.ceil(directory.total / PAGE_SIZE));
  const shownStart = directory.users.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const shownEnd = (page - 1) * PAGE_SIZE + directory.users.length;
  const activeCount = accounts.filter((row) =>
    ACTIVE_STATUSES.has(row.subscription_status),
  ).length;
  const shapes = providerShapeChecks();
  const providerRows = [
    {
      name: "Supabase Auth",
      note: "Sign-in and session service",
      status: providerStatus(
        shapes.SUPABASE_URL.ok && shapes.SUPABASE_ANON_KEY.ok,
        providerHealth?.supabaseAuth ?? null,
      ),
    },
    {
      name: "Supabase Admin",
      note: "Accounts, usage, and billing data",
      status: providerStatus(
        shapes.SUPABASE_URL.ok && shapes.SUPABASE_SERVICE_ROLE_KEY.ok,
        providerHealth?.supabaseAdmin ?? null,
      ),
    },
    {
      name: "Stripe",
      note: "Recurring monthly Price",
      status: stripeStatus(
        shapes.STRIPE_SECRET_KEY.ok && shapes.STRIPE_PRICE_ID.ok,
        providerHealth?.stripe ?? null,
      ),
    },
    {
      name: "Stripe Webhook",
      note: "Production entitlement updates",
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
            <a href="#providers">Provider health</a>
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
            <h1>Accounts and usage</h1>
            <p>
              Read-only production data. No audio, transcripts, prompts,
              answers, Context, or Project State.
            </p>
          </div>
          <span className="internal-live-badge"><i /> Production</span>
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

        <section className="internal-panel internal-provider-panel" id="providers">
          <div className="internal-panel-head">
            <div>
              <p className="internal-kicker">Infrastructure</p>
              <h2>Provider health</h2>
            </div>
            <Link
              className="internal-check-button"
              href={`/internal/?page=${page}&checks=live#providers`}
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
            <table className="internal-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Plan</th>
                  <th>Answers</th>
                  <th>Transcriptions</th>
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
                      <td><span className={`internal-plan is-${plan.toLowerCase()}`}>{plan}</span></td>
                      <td>{owner ? "Unlimited" : (counters?.answer_requests ?? 0)}</td>
                      <td>{owner ? "Unlimited" : (counters?.transcription_requests ?? 0)}</td>
                      <td>{dateLabel(user.lastSignInAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="internal-pagination">
            {page > 1 ? <Link href={`/internal/?page=${page - 1}`}>Previous</Link> : <span />}
            <span>Page {page} of {pageCount}</span>
            {page < pageCount ? <Link href={`/internal/?page=${page + 1}`}>Next</Link> : <span />}
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
