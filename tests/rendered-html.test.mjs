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
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Cue or Read/i);
});
