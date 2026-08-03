/* eslint-disable @next/next/no-img-element */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — CueAside",
  description:
    "How CueAside handles your account, billing, usage data, and the conversations it helps you with.",
  alternates: {
    canonical: "/privacy/",
  },
};

export default function PrivacyPolicy() {
  return (
    <main className="legal-page">
      <header className="masthead">
        <div className="masthead-inner">
          <Link className="masthead-brand" href="/" aria-label="CueAside home">
            <img src="/cueaside-icon.png" alt="" width={28} height={28} />
            CueAside
          </Link>
          <Link className="mono" href="/">
            ← Back to the document
          </Link>
        </div>
      </header>

      <article className="legal-body">
        <div className="mono" style={{ color: "var(--stamp)" }}>
          Privacy Policy
        </div>
        <h1>Your conversations are the product — not our data.</h1>
        <p className="legal-updated">Last updated: July 30, 2026</p>

        <section>
          <h2>The short version</h2>
          <ul>
            <li>
              CueAside servers do not store your transcripts, questions, or
              answers. Conversation content is processed in real time and
              requests to our AI provider are sent with storage disabled.
            </li>
            <li>
              Your session history lives in the CueAside app on your Mac, under
              your control.
            </li>
            <li>
              On our servers we keep the minimum needed to run a paid service:
              your account email, subscription status, and daily usage counts.
            </li>
            <li>We do not sell your data or use it for advertising.</li>
            <li>
              You can check this rather than trust it: the database schema is
              committed in the{" "}
              <a
                href="https://github.com/yachengong/cueaside-website/tree/main/supabase/migrations"
                target="_blank"
                rel="noreferrer"
              >
                public repository
              </a>
              , and the homepage prints the same list as a ledger.
            </li>
          </ul>
        </section>

        <section>
          <h2>What we collect</h2>
          <p>
            <strong>Account.</strong> When you sign in with an email code, we
            store your email address and account identifiers with Supabase, our
            authentication and database provider.
          </p>
          <p>
            <strong>Billing.</strong> Payments run through Stripe. We store
            your subscription status, plan, and renewal dates. Card numbers
            never touch CueAside servers—Stripe handles checkout and the
            billing portal.
          </p>
          <p>
            <strong>Usage counts.</strong> To enforce fair-use limits we count
            how many answer, transcription, and realtime requests your account
            makes each day. These are numbers only—never the content of a
            request.
          </p>
          <p>
            <strong>Waitlist.</strong> If you join early access, we store the
            email you submit so we can send your invite.
          </p>
          <p>
            <strong>Abuse prevention.</strong> Rate-limit records use
            pseudonymized keys derived from network information; we do not keep
            raw IP addresses in these records.
          </p>
        </section>

        <section>
          <h2>How conversation content is handled</h2>
          <p>
            During a session, audio is transcribed and relevant context is sent
            to our AI provider (OpenAI) through the CueAside API to generate
            your answer. These requests are made with storage disabled, and
            CueAside servers do not retain the audio, transcripts, or generated
            answers after the response is delivered to your app.
          </p>
          <p>
            Requests include a pseudonymous safety identifier—a one-way hash
            that lets the provider enforce abuse protections without receiving
            your email or account details.
          </p>
          <p>
            The context you prepare (resume, notes, briefs) and your saved
            sessions stay in the app on your Mac. Removing them there removes
            them from CueAside.
          </p>
        </section>

        <section>
          <h2>Services we rely on</h2>
          <ul>
            <li>
              <strong>Supabase</strong> — authentication and database hosting.
            </li>
            <li>
              <strong>Stripe</strong> — checkout, subscriptions, and the
              billing portal.
            </li>
            <li>
              <strong>OpenAI</strong> — AI transcription and answer generation.
            </li>
            <li>
              <strong>Vercel</strong> — website and API hosting.
            </li>
          </ul>
          <p>
            Each provider processes only what its role requires, under its own
            security and privacy commitments.
          </p>
        </section>

        <section>
          <h2>Your responsibilities in live conversations</h2>
          <p>
            CueAside listens to conversations you take part in. Laws about
            recording and transcribing conversations vary by region, and some
            require the consent of other participants. You are responsible for
            using CueAside in a way that complies with the laws and policies
            that apply to you.
          </p>
        </section>

        <section>
          <h2>Deleting your data</h2>
          <p>
            Account deletion is one call to our API: it cancels any active
            subscription immediately, removes your billing record and usage
            counters, and deletes your sign-in identity. You can also email{" "}
            <a href="mailto:support@cueaside.com">support@cueaside.com</a> from
            your account address and we will run the same deletion for you,
            along with any waitlist entry. Session content is deleted directly
            from the app, since it is stored on your Mac.
          </p>
        </section>

        <section>
          <h2>Changes and contact</h2>
          <p>
            If this policy changes in a way that matters, we will note it here
            with a new date. Questions are welcome at{" "}
            <a href="mailto:support@cueaside.com">support@cueaside.com</a>.
          </p>
        </section>
      </article>

      <footer className="doc-footer">
        <span>© 2026 CueAside · macOS</span>
        <nav>
          <Link href="/">Home</Link>
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
        </nav>
      </footer>
    </main>
  );
}
