import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the CueAside product landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CueAside — The right words, right when you need them<\/title>/i);
  assert.match(html, /Know what to say\./);
  assert.match(html, /START HERE/);
  assert.match(html, /THINKING DEPTH/);
  assert.match(html, /Frequently asked questions/);
  assert.match(html, /English, Chinese, Spanish/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Cue or Read/i);
});
