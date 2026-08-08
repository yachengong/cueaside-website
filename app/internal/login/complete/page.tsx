import type { Metadata } from "next";
import InternalLinkCompletion from "./internal-link-completion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Opening CueAside Console",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default function InternalLoginCompletePage() {
  return (
    <main className="internal-login-shell">
      <section className="internal-login-card" aria-labelledby="console-title">
        <div className="internal-brand-mark" aria-hidden="true">C</div>
        <p className="internal-kicker">Private operations</p>
        <h1 id="console-title">CueAside Console</h1>
        <InternalLinkCompletion />
      </section>
    </main>
  );
}
