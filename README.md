# CueAside website and hosted API

The public product site and secure API for CueAside, a macOS live speaking
copilot for interviews and meetings. Customers sign in with email and never
provide their own OpenAI key.

## Local development

```bash
npm install
npm run dev
```

## Build and validate

```bash
npm test
```

`npm run build` validates the Vercel production app. `npm run build:pages`
creates the temporary static GitHub Pages build used during the migration.

## Production services

- Vercel hosts the Next.js website and API.
- Supabase provides email authentication and Postgres storage.
- Stripe hosts checkout and the customer billing portal.
- OpenAI answer and fallback-transcription requests run through CueAside's API.
- Deepgram provides Nova-3 live transcription through short-lived server-issued
  tokens; its long-lived key never enters the macOS app.

Create the Supabase tables and atomic usage functions by applying
`supabase/migrations/202607290001_cueaside_commercial.sql`, then configure the
variables listed in `.env.example` in Vercel. The service-role, OpenAI, and
Deepgram keys must remain server-only.
