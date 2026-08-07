import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  hashInternalSessionToken,
  internalSessionCookieHeader,
  internalSessionTokenFromCookie,
  parseInternalAdminUserIDs,
} from "../lib/internal-console-policy.ts";

const source = (name) =>
  readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("Console admin allowlist accepts only valid Supabase user UUIDs", () => {
  const first = "00000000-0000-4000-8000-000000000001";
  const second = "ABCDEFAB-1234-4ABC-8DEF-ABCDEFABCDEF";
  const ids = parseInternalAdminUserIDs(
    `${first}, not-an-id, ${second}, ${first}`,
  );
  assert.deepEqual([...ids], [first, second.toLowerCase()]);
});

test("Console session cookie is opaque, host-only, and inaccessible to scripts", () => {
  const token = "a".repeat(43);
  const header = internalSessionCookieHeader(token, { production: true });
  assert.match(header, /^__Host-cueaside-internal-session=/);
  assert.match(header, /Path=\//);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Secure/);
  assert.doesNotMatch(header, /Domain=/);
  assert.equal(
    internalSessionTokenFromCookie(`other=x; ${header}`, true),
    token,
  );
  assert.match(
    internalSessionCookieHeader("", { clear: true, production: true }),
    /Max-Age=0/,
  );
});

test("Console stores only a one-way session-token hash", async () => {
  const token = "session_token_that_never_enters_the_database_123";
  const hash = await hashInternalSessionToken(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hash, await hashInternalSessionToken(token));
});

test("Console database tables are service-role-only and content-free", async () => {
  const [migration, metricsMigration] = await Promise.all([
    source("supabase/migrations/20260807072221_internal_console_foundation.sql"),
    source("supabase/migrations/20260807131000_answer_generation_metrics.sql"),
  ]);
  assert.match(migration, /internal_admin_sessions/);
  assert.match(migration, /internal_audit_log/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant select, insert[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /jsonb|json|bytea/i);
  assert.doesNotMatch(
    migration,
    /^\s*(transcript|audio|prompt|question|answer|content|message|context|resume|note)\w*\s+(text|jsonb|json|bytea)/im,
  );
  assert.match(metricsMigration, /answer_generation_metrics/);
  assert.match(metricsMigration, /enable row level security/);
  assert.match(metricsMigration, /grant select, insert, delete[\s\S]*to service_role/);
  assert.match(metricsMigration, /private\.prune_answer_generation_metrics/);
  assert.match(metricsMigration, /security invoker/);
  assert.doesNotMatch(metricsMigration, /security definer/i);
  assert.match(metricsMigration, /interval '30 days'/);
  assert.doesNotMatch(metricsMigration, /\b(user_id|email|session_id)\b/i);
  assert.doesNotMatch(metricsMigration, /jsonb|json|bytea/i);
  assert.doesNotMatch(
    metricsMigration,
    /^\s*(transcript|audio|prompt|question|answer|content|message|context|resume|note)\w*\s+(text|jsonb|json|bytea)/im,
  );
});

test("Console auth never returns Supabase bearer tokens to the browser", async () => {
  const internalAuth = await source("lib/server/internal-auth.ts");
  assert.match(internalAuth, /CUEASIDE_ADMIN_USER_IDS/);
  assert.match(internalAuth, /createInternalAdminSession/);
  assert.match(internalAuth, /Set-Cookie/);
  assert.doesNotMatch(internalAuth, /Response\.json\(result/);
  assert.doesNotMatch(internalAuth, /user_metadata/);
  assert.match(internalAuth, /The code is invalid or expired\./);
});

test("Console routes and pages are present but absent from public navigation", async () => {
  const [home, layout, consoleLayout, nextConfig] = await Promise.all([
    source("app/page.tsx"),
    source("app/layout.tsx"),
    source("app/internal/layout.tsx"),
    source("next.config.ts"),
  ]);
  assert.doesNotMatch(home, /href=["']\/internal/);
  assert.doesNotMatch(layout, /href=["']\/internal/);
  assert.match(consoleLayout, /index: false/);
  assert.match(consoleLayout, /noarchive: true/);
  assert.match(nextConfig, /source: "\/internal\/:path\*"/);
  assert.match(nextConfig, /noindex, nofollow, noarchive/);
});

test("Console runs provider checks only after an authenticated admin asks", async () => {
  const [page, providers, health, layout] = await Promise.all([
    source("app/internal/page.tsx"),
    source("lib/server/provider-health.ts"),
    source("app/api/health/route.ts"),
    source("app/layout.tsx"),
  ]);

  assert.match(page, /shouldRunProviderChecks \? liveProviderProbes\(\)/);
  assert.match(page, /provider_health_checked/);
  assert.match(page, /Run live checks/);
  assert.match(page, /No credential values are returned or stored/);
  assert.match(page, /deploymentEnvironment/);
  assert.match(page, /Wrong mode · Live/);
  assert.match(page, /Wrong mode · Test/);
  assert.match(page, /Monitoring readiness/);
  assert.match(page, /Not isolated/);
  assert.match(providers, /provider_health/);
  assert.match(providers, /Stripe Webhook|webhook_endpoints/);
  assert.match(providers, /publicSiteURL\(env\)/);
  assert.doesNotMatch(providers, /console\.(?:log|error|warn)/);
  assert.match(health, /liveProviderProbes/);
  assert.match(layout, /SpeedInsights/);
});

test("Console displays only content-free answer performance fields", async () => {
  const [page, storage, openai, metrics] = await Promise.all([
    source("app/internal/page.tsx"),
    source("lib/server/supabase.ts"),
    source("lib/server/openai.ts"),
    source("lib/server/answer-metrics.ts"),
  ]);

  assert.match(page, /Answer performance/);
  assert.match(page, /First readable p95/);
  assert.match(page, /Estimated cost/);
  assert.match(page, /internalAnswerMetricsPage/);
  assert.match(page, /Retained for 30 days/);
  assert.match(storage, /recordAnswerGenerationMetric/);
  assert.match(storage, /adminRequest\("answer_generation_metrics"/);
  assert.match(openai, /scheduleAnswerMetric\(observed\.completion\)/);
  assert.match(openai, /failedAnswerMetric/);
  assert.match(metrics, /answer_metric_persist_failed/);
  const metricInterfaceStart = storage.indexOf(
    "export interface InternalAnswerMetricRow",
  );
  const metricInterfaceEnd = storage.indexOf("\n}\n", metricInterfaceStart) + 3;
  const metricWriterStart = storage.indexOf(
    "export async function recordAnswerGenerationMetric",
  );
  const metricReaderEnd = storage.indexOf(
    "export async function insertTranscriptionDiagnosticMetric",
    metricWriterStart,
  );
  const metricStorage = [
    storage.slice(metricInterfaceStart, metricInterfaceEnd),
    storage.slice(metricWriterStart, metricReaderEnd),
  ].join("\n");
  assert.doesNotMatch(
    metricStorage,
    /question|answerText|prompt|transcript|context|session_id/i,
  );
});

test("Console shows content-free transcription signal and result diagnostics", async () => {
  const [page, storage, route, diagnostics, migration] = await Promise.all([
    source("app/internal/page.tsx"),
    source("lib/server/supabase.ts"),
    source("app/api/telemetry/transcription/route.ts"),
    source("lib/server/transcription-diagnostics.ts"),
    source("supabase/migrations/20260807150000_transcription_diagnostic_metrics.sql"),
  ]);
  assert.match(page, /Transcription diagnostics/);
  assert.match(page, /Submitted segments/);
  assert.match(page, /Completed results/);
  assert.match(page, /Audio and words are never stored/);
  assert.match(storage, /insertTranscriptionDiagnosticMetric/);
  assert.match(storage, /recentInternalTranscriptionDiagnostics/);
  assert.match(route, /const user = await requireUser\(request\)/);
  assert.match(diagnostics, /scope: "transcription-diagnostic"/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /interval '30 days'/);
  const executableMigration = migration.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(
    executableMigration,
    /\b(user_id|email|session_id|filename)\b/i,
  );
  assert.doesNotMatch(migration, /jsonb|json|bytea/i);
});

test("Console metrics use allowlisted filters, exact pagination, retention, and audit", async () => {
  const [page, storage, retention] = await Promise.all([
    source("app/internal/page.tsx"),
    source("lib/server/supabase.ts"),
    source("supabase/migrations/20260807143000_internal_console_retention.sql"),
  ]);

  assert.match(page, /METRIC_MODELS/);
  assert.match(page, /allowedValue\(params\.model, METRIC_MODELS\)/);
  assert.match(page, /allowedValue\(params\.depth, METRIC_DEPTHS\)/);
  assert.match(page, /allowedValue\(params\.status, METRIC_STATUSES\)/);
  assert.match(page, /name="hours"/);
  assert.match(page, /name="model"/);
  assert.match(page, /name="depth"/);
  assert.match(page, /name="status"/);
  assert.match(page, /answer_metrics_viewed/);
  assert.match(page, /Page \{metricsPage\} of \{metricPageCount\}/);
  assert.match(page, /page > pageCount \|\| metricsPage > metricPageCount/);
  assert.match(storage, /Prefer: "count=exact"/);
  assert.match(storage, /"Range-Unit": "items"/);
  assert.match(storage, /query\.set\("model", `eq\.\$\{input\.model\}`\)/);
  assert.match(storage, /query\.set\("depth", `eq\.\$\{input\.depth\}`\)/);
  assert.match(storage, /query\.set\("status", `eq\.\$\{input\.status\}`\)/);
  assert.match(retention, /security invoker/i);
  assert.doesNotMatch(retention, /security definer/i);
  assert.match(retention, /expires_at < now\(\) - interval '7 days'/);
  assert.match(retention, /occurred_at < now\(\) - interval '90 days'/);
  assert.match(retention, /grant delete[\s\S]*to service_role/);
  assert.match(retention, /answer_generation_metrics_recorded_id_idx/);
  assert.match(retention, /revoke all[\s\S]*from public, anon, authenticated/);
});

test("Console inspects every monthly usage counter and subscription lifecycle", async () => {
  const [page, storage] = await Promise.all([
    source("app/internal/page.tsx"),
    source("lib/server/supabase.ts"),
  ]);

  assert.match(page, /Answers/);
  assert.match(page, /Transcriptions/);
  assert.match(page, /Live minutes/);
  assert.match(page, /realtime_tokens \?\? 0\) \* 4/);
  assert.match(page, /cancel_at_period_end/);
  assert.match(page, /Trial through/);
  assert.match(page, /Renews/);
  assert.match(storage, /answer_requests/);
  assert.match(storage, /transcription_requests/);
  assert.match(storage, /realtime_tokens/);
  assert.match(storage, /current_period_end/);
  assert.match(storage, /cancel_at_period_end/);
});
