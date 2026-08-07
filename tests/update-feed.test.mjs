import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const feedURL = new URL("../public/appcast.xml", import.meta.url);

test("the public update feed is signed and starts without a release", async () => {
  const feed = await readFile(feedURL, "utf8");

  assert.match(feed, /<title>CueAside Updates<\/title>/);
  assert.match(feed, /<link>https:\/\/cueaside\.com<\/link>/);
  assert.match(feed, /sparkle-signatures:/);
  assert.match(feed, /edSignature: [A-Za-z0-9+/]+=*/);
  assert.match(feed, /length: \d+/);
  assert.doesNotMatch(feed, /<enclosure\b/);
  assert.doesNotMatch(feed, /PRIVATE|SECRET|TOKEN|PASSWORD/i);
});
