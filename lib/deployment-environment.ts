export interface DeploymentRuntime {
  PUBLIC_SITE_URL?: string;
  VERCEL_ENV?: string;
  SUPABASE_URL?: string;
}

export type CueAsideDeploymentEnvironment =
  | "production"
  | "preview"
  | "development";

// Supabase project URLs are public identifiers, not credentials. Keeping the
// Production origin in code gives every deployment an immutable boundary even
// before a separate Preview project has been provisioned.
export const PRODUCTION_SUPABASE_ORIGIN =
  "https://eqirtrsejuuzwcqnmdca.supabase.co";

export type SupabaseEnvironmentIsolation =
  | {
      ok: true;
      deployment: CueAsideDeploymentEnvironment;
      target: "production" | "non-production";
    }
  | {
      ok: false;
      deployment: CueAsideDeploymentEnvironment;
      code:
        | "supabase_url_invalid"
        | "production_supabase_in_non_production"
        | "non_production_supabase_in_production";
      hint: string;
    };

export function publicSiteURL(
  env: DeploymentRuntime = process.env as DeploymentRuntime,
): string {
  return env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    "https://cueaside.com";
}

export function deploymentEnvironment(
  env: DeploymentRuntime = process.env as DeploymentRuntime,
): CueAsideDeploymentEnvironment {
  const value = env.VERCEL_ENV?.trim().toLowerCase();
  if (value === "production" || value === "preview") return value;
  return "development";
}

function normalizedHTTPSOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function supabaseEnvironmentIsolation(
  env: DeploymentRuntime = process.env as DeploymentRuntime,
): SupabaseEnvironmentIsolation {
  const deployment = deploymentEnvironment(env);
  const origin = normalizedHTTPSOrigin(env.SUPABASE_URL);
  if (!origin) {
    return {
      ok: false,
      deployment,
      code: "supabase_url_invalid",
      hint: "Supabase URL is missing or invalid",
    };
  }

  const targetsProduction = origin === PRODUCTION_SUPABASE_ORIGIN;
  if (deployment === "production" && !targetsProduction) {
    return {
      ok: false,
      deployment,
      code: "non_production_supabase_in_production",
      hint: "Production is not connected to the approved Production Supabase project",
    };
  }
  if (deployment !== "production" && targetsProduction) {
    return {
      ok: false,
      deployment,
      code: "production_supabase_in_non_production",
      hint: "Production Supabase is blocked outside Production",
    };
  }

  return {
    ok: true,
    deployment,
    target: targetsProduction ? "production" : "non-production",
  };
}
