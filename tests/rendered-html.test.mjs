import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the CueAside product landing page", async () => {
  const html = await readFile(
    new URL("../out/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /<title>CueAside — The right words, right when you need them<\/title>/i);
  assert.match(html, /Know what to say\./);
  assert.match(html, /START HERE/);
  assert.match(html, /THINKING DEPTH/);
  assert.match(html, /Frequently asked questions/);
  assert.match(html, /English, Chinese, Spanish/);
  assert.match(html, /<link rel="canonical" href="https:\/\/cueaside\.com\/"/i);
  assert.match(html, /"@type":"SoftwareApplication"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Cue or Read/i);
});

test("publishes search crawler discovery files", async () => {
  const [robots, sitemap] = await Promise.all([
    readFile(new URL("../out/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../out/sitemap.xml", import.meta.url), "utf8"),
  ]);

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /https:\/\/cueaside\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/cueaside\.com\/<\/loc>/);
});
