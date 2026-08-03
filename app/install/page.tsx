/* eslint-disable @next/next/no-img-element */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Installing the CueAside beta — CueAside",
  description:
    "How to install the CueAside private beta on macOS, why the first launch needs a right-click, and which permissions the app asks for.",
  alternates: { canonical: "/install/" },
  robots: { index: false, follow: true },
};

const UPDATED = "August 3, 2026";

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
          Private beta
        </div>
        <h1>Installing the beta.</h1>
        <p className="legal-updated">Updated: {UPDATED}</p>

        <section>
          <h2>What you need</h2>
          <ul>
            <li>A Mac running macOS 15.3 or later (Apple Silicon or Intel).</li>
            <li>The DMG link from your beta invite email.</li>
            <li>About two minutes, most of it spent on step 3.</li>
          </ul>
        </section>

        <section>
          <h2>Why macOS will complain</h2>
          <p>
            <strong>
              This build is not notarized by Apple, and the first launch will
              be blocked.
            </strong>{" "}
            Notarization requires a paid Apple Developer Program membership
            that CueAside has not bought yet. Rather than delay the beta, we
            are shipping the honest version: an ad-hoc signed build, and this
            page telling you exactly what you will see.
          </p>
          <p>
            The public release will be signed with a Developer ID certificate
            and notarized, and this page will disappear. Until then, the
            warning you get is macOS reporting a real fact — no one has
            vouched for this binary — and you are choosing to trust it because
            you know where it came from.
          </p>
        </section>

        <section>
          <h2>The four steps</h2>
          <ol className="numbered install-steps">
            <li>
              <div>
                <b>Open the DMG and drag CueAside to Applications.</b>
                <span>The usual drag-to-the-folder window.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Right-click CueAside in Applications, then choose Open.</b>
                <span>
                  Control-click works too. Double-clicking will only show a
                  dead end — the right-click menu is what offers the override.
                </span>
              </div>
            </li>
            <li>
              <div>
                <b>Click Open in the dialog.</b>
                <span>
                  If no dialog appears, go to System Settings → Privacy &amp;
                  Security, scroll to the bottom, and click{" "}
                  <em>Open Anyway</em> next to the CueAside entry. You only do
                  this once per build.
                </span>
              </div>
            </li>
            <li>
              <div>
                <b>Grant the two permissions when asked.</b>
                <span>
                  Microphone, so it can hear the question. Accessibility, so
                  the global shortcuts work while you are typing in another
                  app. Nothing else is requested.
                </span>
              </div>
            </li>
          </ol>
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

        <section>
          <h2>Verifying the download</h2>
          <p>
            Every beta DMG ships with a receipt file listing its SHA-256. To
            check that what you downloaded is what we built, run this and
            compare the output to the receipt:
          </p>
          <pre className="install-code">
            <code>shasum -a 256 ~/Downloads/SideCue-beta-*.dmg</code>
          </pre>
        </section>

        <section>
          <h2>Removing it</h2>
          <p>
            Drag CueAside from Applications to the Trash. Sessions live in the
            app&rsquo;s own folder on your Mac and go with it. To delete your
            account and everything our servers hold, use Delete Account in the
            app, or email{" "}
            <a href="mailto:support@cueaside.com">support@cueaside.com</a>.
          </p>
        </section>

        <section>
          <h2>When something breaks</h2>
          <p>
            It is a beta; things will. Send what happened to{" "}
            <a href="mailto:support@cueaside.com">support@cueaside.com</a> —
            what you were doing, what you expected, and what you got. If the
            app crashed, macOS keeps the report in Console → Crash Reports;
            attaching it makes the fix much faster.
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
        <span>Private beta</span>
      </footer>
    </main>
  );
}
