import assert from "node:assert/strict";
import test from "node:test";

import {
  deploymentEnvironment,
  publicSiteURL,
} from "../lib/deployment-environment.ts";

test("deployment environment distinguishes production, preview, and local work", () => {
  assert.equal(deploymentEnvironment({ VERCEL_ENV: "production" }), "production");
  assert.equal(deploymentEnvironment({ VERCEL_ENV: "preview" }), "preview");
  assert.equal(deploymentEnvironment({ VERCEL_ENV: "development" }), "development");
  assert.equal(deploymentEnvironment({ VERCEL_ENV: "unexpected" }), "development");
  assert.equal(deploymentEnvironment({}), "development");
});

test("provider checks use the site URL belonging to the current environment", () => {
  assert.equal(publicSiteURL({}), "https://cueaside.com");
  assert.equal(
    publicSiteURL({ PUBLIC_SITE_URL: "https://preview.cueaside.com///" }),
    "https://preview.cueaside.com",
  );
});
