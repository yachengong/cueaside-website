import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the CueAside product and commercial API", async () => {
  const [page, layout, overlay, server] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/live-overlay-demo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /CueAside — The right words, right when you need them/);
  assert.match(page, /Know what to say\./);
  assert.match(overlay, /START HERE/);
  assert.match(page, /THINKING DEPTH/);
  assert.match(page, /Frequently asked questions/);
  assert.match(page, /English, Chinese, Spanish/);
  assert.match(layout, /https:\/\/cueaside\.com/);
  assert.match(layout, /"@type":\s*"SoftwareApplication"/);
  assert.doesNotMatch(page, /codex-preview|react-loading-skeleton|Cue or Read/i);
  assert.match(server, /api\/billing\/webhook|billing\/webhook/);
  assert.match(server, /api\/ai\/answer|ai\/answer/);
});

test("publishes search crawler discovery files", async () => {
  const [robots, sitemap] = await Promise.all([
    readFile(new URL("../dist/client/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../dist/client/sitemap.xml", import.meta.url), "utf8"),
  ]);

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /https:\/\/cueaside\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/cueaside\.com\/<\/loc>/);
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
  const [account, auth, billing] = await Promise.all([
    readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/billing.ts", import.meta.url), "utf8"),
  ]);

  assert.match(account, /name: user\.name/);
  assert.match(account, /avatarUrl: user\.avatarUrl/);
  assert.match(auth, /result\.user_metadata/);
  assert.match(billing, /return_url: `\$\{publicSiteURL\(\)\}\/`/);
  assert.doesNotMatch(billing, /return_url:.*\/account\//);
  assert.match(billing, /plan: paid \? "pro" : "free"/);
  assert.match(billing, /answerRequests: 15/);
  assert.match(billing, /answerRequests: 200/);
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
  assert.match(openai, /if \(entitlement\.bypass\) return/);
  assert.match(billing, /unlimited: boolean/);
  assert.doesNotMatch(openai, /recordUsage\(user\.id, kind\);/);
});
