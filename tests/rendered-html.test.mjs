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
