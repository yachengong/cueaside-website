# Launch runbook — owner actions

Everything the codebase can do is done and in CI. The items below need
accounts, payments or credentials, so they are yours. Do them in order;
each has a verification step so nothing is "probably fine".

## 1. Production keys (blocks everything else)

In Vercel → Project → Settings → Environment Variables, set for
**Production** (Preview/Development get their own test values):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (sk_live_…), `STRIPE_PRICE_ID` (price_…),
  `STRIPE_WEBHOOK_SECRET` (whsec_…)
- `OPENAI_API_KEY`
- `DEEPGRAM_API_KEY` (Member permission or higher; used only to grant
  short-lived Nova-3 tokens)
- `HEALTH_PROBE_TOKEN` (any long random string; enables deep health checks)

Verify — keys never leave your machine:

```bash
cd ~/cueaside-website
npx vercel env pull --environment=production .env.production.local
node scripts/verify-production-keys.mjs .env.production.local
rm .env.production.local
```

Every line must be ✅. After the next deploy you can also check from
outside: `curl -H "x-health-token: $TOKEN" "https://cueaside.com/api/health?probe=live"`.

## 2. Stripe live mode

1. Dashboard → switch to Live mode → create the Product and a monthly
   recurring Price → put its id in `STRIPE_PRICE_ID`.
2. Developers → Webhooks → Add endpoint
   `https://cueaside.com/api/billing/webhook` (subscription + checkout +
   invoice events) → copy the new `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
3. Run one real purchase with a real card, then cancel it from the portal.
   Watch Workbench → Webhooks for Delivered, and confirm the plan flips in
   Supabase `billing_accounts`.

The verifier script from step 1 checks the live key, the price
(monthly + active + livemode) and that the webhook endpoint exists.

## 3. Apple Developer Program ($99/yr)

Enroll at developer.apple.com with the Apple ID you want the company tied
to. When membership is active, in Xcode → Settings → Accounts create a
**Developer ID Application** certificate (the existing
"Apple Development" cert cannot distribute).

Tell Claude when this is done — the archive → sign → notarize → staple →
DMG pipeline and the Sparkle auto-update integration are queued behind
this one credential and can be built and run for you the same day.

## 3b. Shipping the beta WITHOUT the Developer Program

You can run the private beta today. Build it:

```bash
cd ~/Desktop/SideCue && ./Tools/build_beta_dmg.sh
```

That produces `build/SideCue-beta-<version>-<stamp>.dmg`, a `.txt` receipt
with its SHA-256, and preserved dSYMs in `build/dsyms/` (keep these — they
are the only way to read a crash report from that build).

The DMG is ad-hoc signed with hardened runtime but **not notarized**, so
macOS blocks the first launch. Testers follow
[cueaside.com/install](https://cueaside.com/install/) — right-click → Open,
then the two permissions. Send that link with the DMG in the invite email.

When the Developer ID certificate exists, this script gets replaced by a
notarized pipeline and the /install page goes away.

## 4. Third-party monitoring accounts

- Sentry: create org + two projects (macOS, Next.js). The website side is
  already wired — paste the DSN into Vercel as `SENTRY_DSN` and
  `NEXT_PUBLIC_SENTRY_DSN` and it starts reporting. The macOS project's
  DSN goes to Claude.
- Better Stack (or UptimeRobot): monitors for `https://cueaside.com` and
  `https://cueaside.com/api/health`.
- OpenAI: put CueAside in its own Project; set spend alerts at 50/75/90%
  and a hard limit.
- Supabase: Pro plan for daily backups; enable custom SMTP + auth rate
  limits per their production checklist.
- Vercel: enable Web Analytics and Observability (both are toggles).

## 5. Decisions to make (nobody can make them for you)

- Price of the Pro plan (the site prints "$ ——— / month" until then).
- Refund window wording beyond the current "we fix billing mistakes".
- Whether macOS 15.3+ stays the floor, or you lower the deployment
  target after testing on 15.0–15.2.
- Beta list: the 10–20 people for the private week.

## Already done (for reference)

- One website repo: `~/cueaside-website` on `main` is canonical; the copy
  inside `~/Desktop/SideCue/website` is a second clone now synced to the
  same main (its stray work was ported as commit 5667340).
- GitHub Pages double-deploy removed; cueaside.com is Vercel-only.
- `/api/health` validates key shapes and has a token-gated live probe.
- CI (lint + build + tests) on every push/PR.
- Terms: cancellation/refund + system requirements; FAQ: requirements.
- App repo: working tree committed and pushed (builds clean).
- `DELETE /api/account`: self-serve deletion — cancels the Stripe
  subscription, drops billing/usage rows, deletes the auth identity.
- Sentry wired for server, edge and browser; inert until a DSN is set.
- Vercel Web Analytics component in the layout (activate via the toggle).
- Beta DMG pipeline + `/install` guide (see 3b) — verified end to end.
