"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Server Ledger — the site's signature artifact.
 *
 * Every row here must stay true against the real schema in
 * supabase/migrations/*.sql. If a stored field is ever added to the backend,
 * this label is part of that change. A stale ledger is worse than no ledger.
 */

const KEPT: Array<[string, string]> = [
  ["Email address", "1"],
  ["Subscription record", "1"],
  ["Daily request counts", "3 numbers/day"],
];

const NOT_KEPT: Array<[string, string]> = [
  ["Your audio", "0"],
  ["Your transcripts", "0"],
  ["Your questions & answers", "0"],
  ["Your resume, notes & context", "0"],
  ["API keys inside the app", "0"],
];

const SCHEMA_URL =
  "https://github.com/yachengong/cueaside-website/blob/main/supabase/migrations/202607290001_cueaside_commercial.sql";

function Row({
  label,
  value,
  zero,
  index,
}: {
  label: string;
  value: string;
  zero?: boolean;
  index: number;
}) {
  return (
    <div
      className={zero ? "ledger-row is-zero" : "ledger-row"}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <span className="label">{label}</span>
      <span className="leader" aria-hidden="true" />
      <span className="value">{value}</span>
    </div>
  );
}

/**
 * Rows are visible by default. The receipt animation is only armed for a
 * ledger that starts below the fold, so a failed observer, a hydration error
 * or no JavaScript at all still renders the whole label — this artifact must
 * never be able to show up blank.
 */
type Phase = "static" | "armed" | "printed";

export default function ServerLedger({ full = false }: { full?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("static");

  // Runs once: the timers below must outlive the phase changes they cause.
  useEffect(() => {
    const node = root.current;
    if (!node) {
      return;
    }
    const viewport =
      window.innerHeight || document.documentElement.clientHeight || 0;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      viewport <= 0 ||
      node.getBoundingClientRect().top < viewport
    ) {
      return;
    }

    const arm = window.setTimeout(() => setPhase("armed"), 0);
    // Belt and braces: if the observer never fires, print anyway rather than
    // leave the rows hidden.
    const failsafe = window.setTimeout(() => setPhase("printed"), 2500);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase("printed");
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);

    return () => {
      window.clearTimeout(arm);
      window.clearTimeout(failsafe);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={root}
      className={[
        "ledger",
        full ? "ledger-full" : "",
        phase === "armed" ? "is-armed" : "",
        phase === "printed" ? "is-armed is-printed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Server ledger: what CueAside servers store"
    >
      {full ? (
        <div className="ledger-stamp" aria-hidden="true">
          <span>0 words</span>
          <span>stored</span>
        </div>
      ) : null}
      <p className="ledger-title">Server Ledger</p>
      <p className="ledger-sub">
        What the CueAside servers hold, per account
      </p>
      <div className="ledger-divider" aria-hidden="true" />

      <div className="ledger-band">Kept</div>
      {KEPT.map(([label, value], index) => (
        <Row key={label} label={label} value={value} index={index} />
      ))}

      <div className="ledger-divider" aria-hidden="true" />

      <div className="ledger-band">Never kept</div>
      {NOT_KEPT.map(([label, value], index) => (
        <Row
          key={label}
          label={label}
          value={value}
          zero
          index={index + KEPT.length}
        />
      ))}

      <p className="ledger-foot">
        AI calls are proxied server-side with store:false. Abuse-prevention keys
        are hashes, not IP addresses. Session history stays in the app on your
        Mac.{" "}
        <a href={SCHEMA_URL} target="_blank" rel="noreferrer">
          The schema is public →
        </a>
      </p>
    </div>
  );
}
