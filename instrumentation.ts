import * as Sentry from "@sentry/nextjs";

/**
 * Server and edge error reporting. Inert until SENTRY_DSN is set in the
 * environment, so local dev and the static export never phone home.
 *
 * Nothing a user says reaches Sentry: the API routes proxy conversation
 * content without storing it, and sendDefaultPii stays off so request
 * bodies, headers and IPs are not attached to events.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export const onRequestError = Sentry.captureRequestError;
