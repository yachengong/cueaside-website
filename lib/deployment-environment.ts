export interface DeploymentRuntime {
  PUBLIC_SITE_URL?: string;
  VERCEL_ENV?: string;
}

export type CueAsideDeploymentEnvironment =
  | "production"
  | "preview"
  | "development";

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
