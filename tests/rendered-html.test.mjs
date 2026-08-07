import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rendered = (name) =>
  readFile(new URL(`../.next/server/app/${name}`, import.meta.url), "utf8");

const source = (name) =>
  readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("renders the CueAside commercial landing page", async () => {
  const [home, layout] = await Promise.all([
    rendered("index.html"),
    source("app/layout.tsx"),
  ]);

  assert.match(home, /Know.*conversation.*moving\./s);
  assert.match(home, /Server Ledger/);
  assert.match(home, /Real CueAside interface/);
  assert.match(home, /cueaside-overlay-real\.png/);
  assert.doesNotMatch(home, /drawn in code/);
  assert.match(home, /One answer, built to be spoken/);
  assert.match(home, /Your words are not the product/);
  assert.match(home, /store:false/);
  assert.match(home, /English, Chinese, Spanish/);
  assert.match(home, /"@type":\s*"SoftwareApplication"/);
  assert.match(layout, /https:\/\/cueaside\.com/);
});

test("the ledger prints only what the schema actually stores", async () => {
  const [home, schema] = await Promise.all([
    rendered("index.html"),
    source("supabase/migrations/202607290001_cueaside_commercial.sql"),
  ]);

  // Rows claimed as kept must exist as real columns.
  assert.match(schema, /email text/);
  assert.match(schema, /subscription_status text/);
  assert.match(schema, /answer_requests integer/);
  assert.match(schema, /transcription_requests integer/);
  assert.match(schema, /realtime_tokens integer/);

  // Rows claimed as never kept must have no column able to hold them. A
  // content column would be text/jsonb/bytea — counters like
  // `transcription_requests integer` are counts, not contents.
  assert.doesNotMatch(
    schema,
    /^\s*(transcript|audio|prompt|question|answer|content|message|context|resume|note)\w*\s+(text|jsonb|json|bytea)/im,
  );

  assert.match(home, /Your audio/);
  assert.match(home, /Your transcripts/);
  assert.match(home, /Your questions &amp; answers|Your questions & answers/);
});

test("the page makes no social-proof claims it cannot back", async () => {
  const home = await rendered("index.html");

  assert.doesNotMatch(home, /trusted by|as seen in|\d+[,\d]*\+? (users|customers)/i);
  // Banned brand vocabulary: superlatives and stealth marketing.
  assert.doesNotMatch(
    home,
    /guaranteed|supercharge|#1 |ace your|crush your|100% (accurate|undetectable)/i,
  );
  assert.doesNotMatch(home, /codex-preview|react-loading-skeleton/i);
});

test("exposes the commercial API routes", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../.next/server/app-paths-manifest.json", import.meta.url),
      "utf8",
    ),
  );

  for (const route of [
    "/api/billing/webhook/route",
    "/api/billing/checkout/route",
    "/api/ai/answer/route",
    "/api/ai/reply-check/route",
    "/api/ai/transcribe/route",
    "/api/ai/deepgram-token/route",
    "/api/ai/realtime-token/route",
    "/api/auth/request-code/route",
    "/api/waitlist/route",
  ]) {
    assert.ok(route in manifest, `missing route ${route}`);
  }
});

test("guards every AI route with authentication, usage, and burst limits", async () => {
  const routeNames = [
    "answer",
    "deepgram-token",
    "realtime-token",
    "reply-check",
    "transcribe",
  ];
  const routes = await Promise.all(
    routeNames.map((name) => source(`app/api/ai/${name}/route.ts`)),
  );
  for (const [index, route] of routes.entries()) {
    assert.match(
      route,
      /const user = await requireUser\(request\)/,
      `${routeNames[index]} must authenticate before provider access`,
    );
  }

  const [openai, deepgram] = await Promise.all([
    source("lib/server/openai.ts"),
    source("lib/server/deepgram.ts"),
  ]);

  for (const scope of [
    'scope: "answer"',
    'scope: "transcription"',
    'scope: "realtime-token"',
    'scope: "reply-check"',
  ]) {
    assert.match(openai, new RegExp(scope));
  }
  for (const usageKind of [
    'authorizeAI(user, "answerRequests")',
    'authorizeAI(user, "transcriptionRequests")',
    'authorizeAI(user, "realtimeTokens")',
  ]) {
    assert.match(openai, new RegExp(usageKind.replace(/[()]/g, "\\$&")));
  }
  assert.match(deepgram, /scope: "deepgram-token"/);
  assert.match(
    deepgram,
    /recordUsage\([\s\S]*user\.id[\s\S]*"realtimeTokens"[\s\S]*entitlement\.bypass/,
  );
  assert.match(deepgram, /ttl_seconds: 5 \* 60/);

  const transcription = openai.slice(openai.indexOf("export async function proxyTranscription"));
  const validatesFileAt = transcription.indexOf("file instanceof File");
  const consumesUsageAt = transcription.indexOf(
    'authorizeAI(user, "transcriptionRequests")',
  );
  assert.ok(validatesFileAt >= 0 && consumesUsageAt > validatesFileAt);
});

test("keeps the waitlist as the only conversion path", async () => {
  const [home, form] = await Promise.all([
    rendered("index.html"),
    source("app/early-access-form.tsx"),
  ]);

  assert.match(form, /\/api\/waitlist/);
  assert.match(home, /you@company\.com/);
  assert.match(home, /href="\/privacy\/"/);
  assert.match(home, /href="\/terms\/"/);
});

test("exposes a beta download only through validated public configuration", async () => {
  const [access, config] = await Promise.all([
    source("app/beta-access.tsx"),
    source("lib/public-beta.ts"),
  ]);

  assert.match(access, /Download CueAside beta/);
  assert.match(access, /EarlyAccessForm/);
  assert.match(config, /CUEASIDE_BETA_DOWNLOAD_URL/);
  assert.match(config, /url\.protocol !== "https:"/);
  assert.match(config, /\^\[a-f0-9\]\{64\}\$/);
});

test("renders the trust pages", async () => {
  const [privacy, terms] = await Promise.all([
    rendered("privacy.html"),
    rendered("terms.html"),
  ]);

  assert.match(privacy, /Privacy Policy — CueAside/);
  assert.match(privacy, /storage disabled/);
  assert.match(privacy, /support@cueaside\.com/);
  assert.match(terms, /Terms of Service — CueAside/);
  assert.match(terms, /billed through Stripe/);
});

test("publishes search crawler discovery files", async () => {
  const [robots, sitemap] = await Promise.all([
    source("public/robots.txt"),
    source("public/sitemap.xml"),
  ]);

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /https:\/\/cueaside\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/cueaside\.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/cueaside\.com\/privacy\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/cueaside\.com\/terms\/<\/loc>/);
});

test("hardens public authentication entry points", async () => {
  const [rateLimit, auth] = await Promise.all([
    readFile(new URL("../lib/server/rate-limit.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/auth.ts", import.meta.url), "utf8"),
  ]);

  assert.match(rateLimit, /x-vercel-forwarded-for/);
  assert.doesNotMatch(rateLimit, /headers\.get\("cf-connecting-ip"\)/);
  assert.match(auth, /invalid_oauth_state/);
  assert.match(auth, /callback\.searchParams\.set\("state", state\)/);
  assert.match(auth, /scope: "auth-refresh"/);
});

test("keeps account and billing responses compatible with the macOS app", async () => {
  const [account, auth, billing, usagePolicy] = await Promise.all([
    readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/billing.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/usage-policy.ts", import.meta.url), "utf8"),
  ]);

  assert.match(account, /name: user\.name/);
  assert.match(account, /avatarUrl: user\.avatarUrl/);
  assert.match(auth, /result\.user_metadata/);
  assert.match(billing, /return_url: `\$\{publicSiteURL\(\)\}\/`/);
  assert.doesNotMatch(billing, /return_url:.*\/account\//);
  assert.match(billing, /plan: paid \? "pro" : "free"/);

  // Self-serve deletion must exist and run in the safe order:
  // cancel billing, then our rows, then the auth identity.
  assert.match(account, /export async function DELETE/);
  const deleteBody = account.slice(account.indexOf("export async function DELETE"));
  const cancelAt = deleteBody.indexOf("cancelStripeSubscriptionImmediately");
  const dataAt = deleteBody.indexOf("deleteUserData");
  const authAt = deleteBody.indexOf("deleteAuthUser");
  assert.ok(cancelAt !== -1 && dataAt !== -1 && authAt !== -1);
  assert.ok(cancelAt < dataAt && dataAt < authAt, "deletion order is cancel -> data -> auth");
  assert.match(usagePolicy, /answerRequests: 15/);
  assert.match(usagePolicy, /answerRequests: 200/);
  assert.match(account, /usageFor/);
  assert.match(account, /entitlement\.bypass/);
});

test("uses monthly plan-aware usage instead of subscription-only access", async () => {
  const [billing, storage, migration, openai] = await Promise.all([
    readFile(new URL("../lib/server/billing.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/supabase.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../supabase/migrations/202608010001_free_pro_plans.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/server/openai.ts", import.meta.url), "utf8"),
  ]);

  assert.match(billing, /active: true/);
  assert.match(billing, /current\.paid/);
  assert.match(storage, /consume_monthly_usage/);
  assert.match(migration, /primary key \(user_id, period_start\)/);
  assert.match(openai, /recordUsage\([\s\S]*entitlement\.bypass/);
  assert.match(billing, /usageDecision\(plan, kind, unlimited\)/);
  assert.match(billing, /unlimited: boolean/);
  assert.doesNotMatch(openai, /recordUsage\(user\.id, kind\);/);
});

test("keeps answer-depth routing server-controlled", async () => {
  const [openai, latency] = await Promise.all([
    readFile(new URL("../lib/server/openai.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../lib/server/answer-latency.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(latency, /instinct:[\s\S]*gpt-5\.6-luna[\s\S]*effort: "none"/);
  assert.match(latency, /balanced:[\s\S]*gpt-5\.6-terra[\s\S]*effort: "none"/);
  assert.match(latency, /precise:[\s\S]*gpt-5\.6-terra[\s\S]*serviceTier: "fast"/);
  assert.match(latency, /thinking:[\s\S]*gpt-5\.6-sol[\s\S]*effort: "low"/);
  assert.match(openai, /cueaside_depth/);
  assert.match(openai, /ANSWER_ROUTES\[depth\]/);
  assert.match(openai, /createSequentialAnswerStream/);
  assert.match(openai, /first_readable_timeout/);
  assert.equal(
    openai.match(/authorizeAI\(user, "answerRequests"\)/g)?.length,
    1,
  );
});

test("the beta install guide is honest about the unsigned build", async () => {
  const install = await rendered("install.html");

  assert.match(install, /not notarized by Apple/);
  assert.match(install, /right-click|Right-click/);
  assert.match(install, /macOS 15\.3 or later/);
  // Permissions must be named with their reason, not just requested.
  assert.match(install, /Microphone/);
  assert.match(install, /Accessibility/);
  // Beta instructions must stay out of search results while they apply.
  assert.match(install, /noindex/);
});
