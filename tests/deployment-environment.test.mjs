import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deploymentEnvironment,
  PRODUCTION_SUPABASE_ORIGIN,
  publicSiteURL,
  supabaseEnvironmentIsolation,
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

test("Production accepts only the approved Production Supabase project", () => {
  assert.deepEqual(
    supabaseEnvironmentIsolation({
      VERCEL_ENV: "production",
      SUPABASE_URL: `${PRODUCTION_SUPABASE_ORIGIN}/`,
    }),
    { ok: true, deployment: "production", target: "production" },
  );

  const wrongProject = supabaseEnvironmentIsolation({
    VERCEL_ENV: "production",
    SUPABASE_URL: "https://development-project.supabase.co",
  });
  assert.equal(wrongProject.ok, false);
  assert.equal(wrongProject.code, "non_production_supabase_in_production");
});

test("Preview and local development cannot access Production Supabase", () => {
  for (const VERCEL_ENV of ["preview", "development", undefined]) {
    const result = supabaseEnvironmentIsolation({
      VERCEL_ENV,
      SUPABASE_URL: PRODUCTION_SUPABASE_ORIGIN,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "production_supabase_in_non_production");
  }

  assert.deepEqual(
    supabaseEnvironmentIsolation({
      VERCEL_ENV: "preview",
      SUPABASE_URL: "https://development-project.supabase.co",
    }),
    { ok: true, deployment: "preview", target: "non-production" },
  );
});

test("invalid Supabase URLs fail the isolation boundary", () => {
  for (const SUPABASE_URL of [
    undefined,
    "http://development-project.supabase.co",
    "https://development-project.supabase.co/rest/v1",
    "https://user@development-project.supabase.co",
  ]) {
    const result = supabaseEnvironmentIsolation({
      VERCEL_ENV: "preview",
      SUPABASE_URL,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "supabase_url_invalid");
  }
});

test("the shared server runtime and provider readiness enforce the boundary", async () => {
  const [runtime, providerHealth] = await Promise.all([
    readFile(new URL("../lib/server/runtime.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../lib/server/provider-health.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(runtime, /key === "SUPABASE_URL"/);
  assert.match(runtime, /supabaseEnvironmentIsolation/);
  assert.match(runtime, /"environment_not_isolated"/);
  assert.match(providerHealth, /checks\.SUPABASE_ENVIRONMENT\.ok/);
  assert.match(providerHealth, /status: "environment_blocked"/);
});
