/* eslint-disable @next/next/no-img-element */

import type { Metadata } from "next";
import Link from "next/link";
import EarlyAccessForm from "../early-access-form";

export const metadata: Metadata = {
  title: "CueAside for macOS — release status",
  description:
    "Release status and system requirements for the signed, notarized CueAside macOS app.",
  alternates: { canonical: "/install/" },
  robots: { index: false, follow: true },
};

const UPDATED = "August 7, 2026";

export default function InstallGuide() {
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
          Release status
        </div>
        <h1>The public installer is not available yet.</h1>
        <p className="legal-updated">Updated: {UPDATED}</p>

        <p>
          CueAside will open downloads only after the macOS app is signed with
          a Developer ID certificate and notarized by Apple. We are not
          distributing an unsigned or ad-hoc-signed private beta.
        </p>

        <EarlyAccessForm
          source="install-release-status"
          note="We’ll send the signed release link and price before anyone is charged."
        />

        <section>
          <h2>What you need</h2>
          <ul>
            <li>A Mac running macOS 15.3 or later (Apple Silicon or Intel).</li>
            <li>Microphone permission for the audio input you select.</li>
            <li>Accessibility permission for global keyboard shortcuts.</li>
          </ul>
        </section>

        <section>
          <h2>What the release will include</h2>
          <p>
            The distributed app will carry a Developer ID signature, pass
            Apple notarization, and ship in a verified DMG. Users should not
            need to bypass Gatekeeper to install it.
          </p>
          <p>
            We will publish the release version and checksum alongside the
            download after installation, permissions, login, session handling,
            updates, and uninstall behavior pass clean-Mac verification.
          </p>
        </section>

        <section>
          <h2>What the permissions actually do</h2>
          <p>
            <strong>Microphone</strong> — the app listens to the audio input
            you pick and detects when a question has landed. The audio is
            transcribed and answered in real time; our servers keep none of
            it. <strong>Accessibility</strong> — macOS requires it for global
            keyboard shortcuts, which is how you drive the overlay (⌘J to
            start a session, ⌘↩ to answer, ⌘P to hide) without leaving the
            call app. It is not used to read other applications.
          </p>
          <p>
            The complete list of what our servers store is printed on the{" "}
            <Link href="/">homepage ledger</Link>, and the{" "}
            <Link href="/privacy/">privacy policy</Link> says the same thing in
            prose.
          </p>
        </section>
      </article>

      <footer className="doc-footer">
        <span>© 2026 CueAside · macOS</span>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/privacy/">Privacy</Link>
          <Link href="/terms/">Terms</Link>
        </nav>
        <span>Signed release pending</span>
      </footer>
    </main>
  );
}
