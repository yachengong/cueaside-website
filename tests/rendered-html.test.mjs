import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rendered = (name) =>
  readFile(new URL(`../.next/server/app/${name}`, import.meta.url), "utf8");

test("renders the CueAside product page", async () => {
  const [home, layout] = await Promise.all([
    rendered("index.html"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(home, /CueAside — The right words, right when you need them/);
  assert.match(home, /Know what to say\./);
  assert.match(home, /START HERE/);
  assert.match(home, /THINKING DEPTH/);
  assert.match(home, /Frequently asked questions/);
  assert.match(home, /English, Chinese, Spanish/);
  assert.match(home, /"@type":\s*"SoftwareApplication"/);
  assert.doesNotMatch(home, /codex-preview|react-loading-skeleton|Cue or Read/i);
  assert.match(layout, /https:\/\/cueaside\.com/);
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

test("renders the early-access waitlist and trust pages", async () => {
  const [home, privacy, terms] = await Promise.all([
    rendered("index.html"),
    rendered("privacy.html"),
    rendered("terms.html"),
  ]);

  assert.match(home, /Private by design/);
  assert.match(home, /Join early access/);
  assert.match(home, /you@company\.com/);
  assert.match(home, /href="\/privacy\/"/);
  assert.match(home, /href="\/terms\/"/);
  assert.match(privacy, /Privacy Policy — CueAside/);
  assert.match(privacy, /storage disabled/);
  assert.match(privacy, /support@cueaside\.com/);
  assert.match(terms, /Terms of Service — CueAside/);
  assert.match(terms, /billed through Stripe/);
});

test("publishes search crawler discovery files", async () => {
  const [robots, sitemap] = await Promise.all([
    readFile(new URL("../public/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8"),
  ]);

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /https:\/\/cueaside\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/cueaside\.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/cueaside\.com\/privacy\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/cueaside\.com\/terms\/<\/loc>/);
});
