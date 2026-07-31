"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A drawn-in-code recreation of the CueAside overlay. Not a screen recording —
 * the caption on the page says so. The depth switcher mirrors the app's real
 * control: it changes how much the model reasons before the answer appears.
 */

type Point = { label: string; topic: ReactNode; detail: string };

type Depth = {
  key: string;
  name: string;
  effort: string;
  note: string;
  lead: ReactNode;
  points: Point[];
};

const QUESTION = "Walk me through a project where you disagreed with your team.";

const DEPTHS: Depth[] = [
  {
    key: "instinct",
    name: "Instinct",
    effort: "no extra reasoning",
    note: "Fastest. You get the opening sentence and nothing else — enough to start talking while you think.",
    lead: (
      <>
        We disagreed on <mark>rewriting the pipeline</mark>, and I asked for a
        two-week test before we committed.
      </>
    ),
    points: [],
  },
  {
    key: "balanced",
    name: "Balanced",
    effort: "light reasoning",
    note: "The default. An opening you can say immediately, then two points to keep going if the room wants more.",
    lead: (
      <>
        We disagreed on <mark>rewriting the pipeline</mark>, and I asked for a
        two-week test before we committed.
      </>
    ),
    points: [
      {
        label: "THE DISAGREEMENT",
        topic: (
          <>
            The team wanted a rewrite; I thought the cost was in{" "}
            <mark>one bad join</mark>.
          </>
        ),
        detail: "Same symptom, two very different price tags.",
      },
      {
        label: "WHAT I DID",
        topic: (
          <>
            I proposed a <mark>time-boxed test</mark> instead of a decision.
          </>
        ),
        detail: "Two weeks of profiling, then we choose with numbers.",
      },
    ],
  },
  {
    key: "precise",
    name: "Precise",
    effort: "more reasoning",
    note: "Sharper structure and more exact language. Useful for technical questions where the terms have to be right.",
    lead: (
      <>
        We disagreed on <mark>rewriting the pipeline</mark>, so I converted the
        argument into a <mark>two-week measurement</mark>.
      </>
    ),
    points: [
      {
        label: "THE DISAGREEMENT",
        topic: (
          <>
            The team read the latency as architectural; I read it as{" "}
            <mark>one unindexed join</mark>.
          </>
        ),
        detail: "A rewrite is a quarter. A join is an afternoon.",
      },
      {
        label: "WHAT I DID",
        topic: (
          <>
            I asked for a <mark>time-boxed profile</mark> before anyone
            committed headcount.
          </>
        ),
        detail: "Agreed up front which number would settle it.",
      },
      {
        label: "OUTCOME",
        topic: (
          <>
            The profile found it. <mark>p99 dropped 60%</mark> without the
            rewrite.
          </>
        ),
        detail: "We kept the rewrite on the roadmap, but for the right reason.",
      },
    ],
  },
  {
    key: "thinking",
    name: "Thinking",
    effort: "most reasoning",
    note: "Slowest and most considered. It will also surface the tradeoff a sharp interviewer is about to ask you about.",
    lead: (
      <>
        We disagreed on <mark>rewriting the pipeline</mark>, so I converted the
        argument into a <mark>two-week measurement</mark>.
      </>
    ),
    points: [
      {
        label: "THE DISAGREEMENT",
        topic: (
          <>
            The team read the latency as architectural; I read it as{" "}
            <mark>one unindexed join</mark>.
          </>
        ),
        detail: "A rewrite is a quarter. A join is an afternoon.",
      },
      {
        label: "WHAT I DID",
        topic: (
          <>
            I asked for a <mark>time-boxed profile</mark> and named the number
            that would settle it.
          </>
        ),
        detail: "Disagreement became a test instead of a standoff.",
      },
      {
        label: "OUTCOME",
        topic: (
          <>
            <mark>p99 dropped 60%</mark> without the rewrite.
          </>
        ),
        detail: "The rewrite stayed on the roadmap, for the right reason.",
      },
      {
        label: "IF THEY PUSH",
        topic: (
          <>
            Be ready for <mark>&ldquo;what if you&rsquo;d been wrong?&rdquo;</mark>
          </>
        ),
        detail: "Two weeks was the cost of being wrong. I could pay that.",
      },
    ],
  },
];

export default function OverlayDemo() {
  const [depthIndex, setDepthIndex] = useState(1);
  const [typed, setTyped] = useState(QUESTION);
  const depth = DEPTHS[depthIndex];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // The first tick clears the server-rendered text, so no state is set
    // synchronously inside the effect.
    let index = 0;
    const timer = window.setInterval(() => {
      setTyped(QUESTION.slice(0, index));
      index += 1;
      if (index > QUESTION.length) {
        window.clearInterval(timer);
      }
    }, 26);

    return () => window.clearInterval(timer);
  }, []);

  const typing = typed.length < QUESTION.length;

  return (
    <div className="demo-wrap">
      <div className="overlay-card">
        <div className="overlay-bar">
          <span className="overlay-live" aria-hidden="true" />
          <b>Answering</b>
          <span className="overlay-mode">
            DE · EN · {depth.name.toUpperCase()} · CTX
          </span>
          <span className="spacer" />
          <span className="overlay-chip">00:04</span>
          <span className="overlay-chip">⌂</span>
        </div>

        <div className="overlay-field">
          <span>Question · heard on this Mac</span>
          <div className="overlay-question">
            {typed}
            {typing ? <i className="caret" aria-hidden="true" /> : null}
          </div>
        </div>

        <div className="overlay-field">
          <span>Answer · ⌘↑ / ⌘↓ to scroll</span>
          <div className="overlay-answer" key={depth.key}>
            <p className="answer-lead">
              <small>START HERE</small>
              <span>{depth.lead}</span>
            </p>
            {depth.points.map((point) => (
              <p className="answer-point" key={point.label}>
                <small>{point.label}</small>
                <b>{point.topic}</b>
                <i>{point.detail}</i>
              </p>
            ))}
          </div>
        </div>

        <div className="overlay-foot">
          <button type="button" className="run" tabIndex={-1}>
            Run
          </button>
          <button type="button" tabIndex={-1}>
            Retry
          </button>
          <button type="button" tabIndex={-1}>
            Clear
          </button>
          <span className="opacity">Opacity 70%</span>
        </div>
      </div>

      <div className="depth-panel">
        <span>Thinking depth</span>
        <div className="depth-list">
          {DEPTHS.map((item, index) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={index === depthIndex}
              onClick={() => setDepthIndex(index)}
            >
              {item.name}
              <em>{item.effort}</em>
            </button>
          ))}
        </div>
        <p className="depth-note">{depth.note}</p>
      </div>
    </div>
  );
}
