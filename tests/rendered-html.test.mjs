import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rendered = (name) =>
  readFile(new URL(`../.next/server/app/${name}`, import.meta.url), "utf8");

const source = (name) =>
  readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("renders the CueAside disclosure document", async () => {
  const [home, layout] = await Promise.all([
    rendered("index.html"),
    source("app/layout.tsx"),
  ]);

  assert.match(home, /The copilot you could use with the door open/);
  assert.match(home, /Server Ledger/);
  assert.match(home, /START HERE/);
  assert.match(home, /What it won&#x27;t do|What it won.t do/);
  assert.match(home, /Where we stand/);
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

  assert.match(home, /NO TESTIMONIALS/);
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
    "/api/ai/transcribe/route",
    "/api/auth/request-code/route",
    "/api/waitlist/route",
  ]) {
    assert.ok(route in manifest, `missing route ${route}`);
  }
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
