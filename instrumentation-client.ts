import * as Sentry from "@sentry/nextjs";

/**
 * Browser error reporting for the marketing site and the waitlist form.
 * Inert unless NEXT_PUBLIC_SENTRY_DSN is set. No session replay, no PII:
 * this exists to catch a broken page, not to watch visitors.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
