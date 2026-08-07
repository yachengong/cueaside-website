# CueAside Operations Runbook

This is the first-response and rollback procedure for the CueAside website and
hosted API. Never copy prompts, transcripts, answers, audio, access tokens,
email addresses, or provider response bodies into an incident ticket or chat.

## What is monitored

- GitHub Actions runs the privacy-safe `Production uptime` smoke every 15
  minutes and supports a manual run after every deployment
- Vercel deployment state, runtime errors, status codes, and function latency
- `/api/health` availability and dependency readiness
- privacy-safe `external_call` records with only service, operation, HTTP
  status, and duration
- Sentry exceptions and transactions after request, breadcrumb, user, and
  arbitrary extra context are removed
- Supabase Auth, database health, and security advisor findings
- Stripe webhook delivery and subscription events
- OpenAI and Deepgram errors, latency, rate limits, and spend

The server must never log provider bodies. A network exception is represented
as `status: 0`; an HTTP provider failure uses its numeric status.

The scheduled smoke records only the check label, HTTP status, duration, and
attempt count. It verifies the homepage, public health, unauthenticated AI
rejection, and unauthenticated Console redirect. When the repository secret
`CUEASIDE_HEALTH_PROBE_TOKEN` is configured, it also calls the private health
probe and requires Supabase Auth, Supabase Admin, Stripe, the Stripe webhook,
OpenAI, and Deepgram to be reachable. It also requires the production Stripe
Price to be active, monthly, and in live mode. Without that secret, the deep
probe is explicitly skipped while the public checks continue.

Set `CUEASIDE_HEALTH_PROBE_TOKEN` to the same value as the Production-only
Vercel `HEALTH_PROBE_TOKEN`. Add it as a GitHub Actions repository secret only
after the live provider credentials and Stripe Price are ready. Never print,
paste into workflow YAML, or expose this value to pull requests. Keep GitHub
Actions failure notifications enabled for the repository owner.

## Suggested alerts

| Signal | Warning | Critical |
|---|---|---|
| Website or `/api/health` | 2 failed checks in 5 minutes | unavailable for 10 minutes |
| API 5xx rate | over 1% for 10 minutes | over 2% for 5 minutes with at least 20 requests |
| OpenAI answer header latency | p95 over 10 seconds | p95 over 15 seconds |
| Provider failures | over 3% for 10 minutes | over 5% for 5 minutes |
| Stripe webhook | first non-2xx delivery | repeated failure or event backlog |
| Provider spend | 50% and 80% of monthly budget | 100% of monthly budget |
| Supabase security | new advisor warning | exposed table, key, or auth incident |

Tune percentages after real traffic exists; do not alert on expected
unauthenticated `401` smoke requests.

## First ten minutes

1. Record the UTC start time, affected environment, user-visible symptom, and
   latest known-good deployment ID.
2. Check Vercel Runtime Errors, then group runtime logs by status code and
   route. Do not open or paste request content.
3. Check `/api/health` with the private probe token and identify which
   dependency is unavailable. The public response must remain minimal.
4. Check the matching provider dashboard for an outage, rate limit, rejected
   credential, or spend cap.
5. Decide whether to observe, disable a narrow flow, rotate a credential, or
   roll back. Prefer the smallest reversible action.
6. After mitigation, run public health, unauthenticated security checks, and
   one disposable authenticated smoke test.

## Severity

- **SEV-1:** credential or personal-data exposure, cross-account access,
  incorrect billing at scale, or total production outage.
- **SEV-2:** login, answers, transcription, account deletion, or billing is
  unavailable for a meaningful group of users.
- **SEV-3:** degraded latency, isolated retries, analytics gaps, or a broken
  non-critical page with a workaround.

For SEV-1, stop the affected path first, preserve privacy-safe timestamps and
deployment identifiers, rotate credentials, and do not resume until access
boundaries are verified.

## Roll back a website deployment

1. In Vercel Deployments, identify the most recent known-good Production
   deployment and inspect its commit and environment.
2. Promote or roll back to that deployment using Vercel's dashboard rollback
   action. Do not rebuild an old commit with today's environment by accident.
3. Confirm the custom domain points at the restored deployment and its state is
   Ready.
4. Run `/api/health`, Google/email auth start, unauthenticated AI rejection,
   and one authenticated answer with a disposable account.
5. Scan Runtime Errors and 5xx logs after traffic reaches the restored build.

Database migrations are forward-only. Do not automatically reverse a
production migration that may have received writes. Create a corrective
migration, test it against development, back up affected rows, and then apply
it deliberately.

## Common incidents

### OpenAI answers are slow or failing

- Filter `external_call` by `service=openai` and `operation=answer`.
- Separate `429`, provider `5xx`, and `status=0` network failures.
- Check the OpenAI status, model limits, Fast service tier, and budget.
- Keep the four depth mappings stable during the incident; change one routing
  decision at a time and record it.

### Deepgram live transcription disconnects

- Filter `service=deepgram` and `operation=deepgram_grant`.
- Check whether grants fail or only the later WebSocket disconnects.
- Verify the macOS client can obtain a fresh grant after network recovery.
- Use the retained temporary audio Retry path when available; never upload or
  retain raw audio solely for diagnostics.

### Authentication fails

- Exclude expected missing-token `401` requests.
- Check Supabase Auth health, OAuth provider settings, redirect URLs, and
  refresh-token rejection separately from transient network failures.
- Do not clear a macOS session unless Supabase explicitly rejects the refresh
  credential.

### Stripe webhook or entitlement is wrong

- Check Stripe's event delivery attempts and event ID.
- Confirm the webhook secret and Price belong to the same test or live mode.
- Replay only the specific failed event after fixing the endpoint.
- Verify event ordering protections before manually changing entitlement rows.

### Credential or environment crossover

- Disable the affected Preview or Production route.
- Follow `CUEASIDE_ENVIRONMENT_RUNBOOK.md` in the macOS repository.
- Rotate the credential in the provider, update only its intended Vercel
  scope, redeploy, verify, then revoke the old credential.
- Inspect provider usage and affected account records for the exposure window.

## Close the incident

An incident is closed only after:

- the user-facing flow and the underlying dependency both pass;
- runtime error and 5xx scans are clean for the agreed observation window;
- billing, usage, and account state are reconciled when relevant;
- no transcript, prompt, answer, audio, token, email, or raw provider body was
  copied into telemetry or incident notes; and
- the cause, fix, rollback path, and one prevention action are recorded.
