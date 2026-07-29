"use client";

import { useEffect, useState, type ReactNode } from "react";

type DemoSection = {
  label: string;
  topic: ReactNode;
  detail: string;
};

type DemoScenario = {
  name: string;
  mode: string;
  question: string;
  opening: ReactNode;
  sections: DemoSection[];
};

const scenarios: DemoScenario[] = [
  {
    name: "Interview",
    mode: "DE · EN · BALANCED · CTX",
    question: "How would you handle a project that’s falling behind?",
    opening: (
      <>
        I’d find the <mark>real blocker</mark>, protect the{" "}
        <mark>critical path</mark>, and reset expectations early.
      </>
    ),
    sections: [
      {
        label: "ROOT CAUSE",
        topic: (
          <>
            I’d confirm the <mark>constraint</mark> with the people closest to it.
          </>
        ),
        detail: "That separates a planning problem from a true delivery risk.",
      },
      {
        label: "RECOVERY PLAN",
        topic: (
          <>
            Then I’d rebuild the plan around <mark>must-have scope</mark>.
          </>
        ),
        detail: "Lower-risk work moves behind a clear follow-up milestone.",
      },
      {
        label: "COMMUNICATION",
        topic: (
          <>
            I’d make the <mark>trade-off</mark> visible before it becomes a surprise.
          </>
        ),
        detail: "Stakeholders get a new date, owner, and decision point.",
      },
    ],
  },
  {
    name: "Technical",
    mode: "DE · EN · PRECISE · CTX",
    question: "How do you prevent duplicate events in a streaming pipeline?",
    opening: (
      <>
        I make processing <mark>idempotent</mark> by carrying a stable{" "}
        <mark>event ID</mark> through every stage.
      </>
    ),
    sections: [
      {
        label: "INGESTION",
        topic: (
          <>
            The producer assigns the <mark>deduplication key</mark> before publishing.
          </>
        ),
        detail: "Every retry keeps the same identity instead of creating a new event.",
      },
      {
        label: "PROCESSING",
        topic: (
          <>
            Consumers check durable state before applying a <mark>side effect</mark>.
          </>
        ),
        detail: "That protects writes even when delivery is at least once.",
      },
      {
        label: "RECOVERY",
        topic: (
          <>
            Replay uses the same key and preserves the <mark>original ordering</mark>.
          </>
        ),
        detail: "Metrics track duplicates instead of silently hiding upstream issues.",
      },
    ],
  },
  {
    name: "Meeting",
    mode: "GENERAL · EN · INSTINCT · CTX",
    question: "What should we prioritize before launch?",
    opening: (
      <>
        I’d protect the <mark>launch path</mark> first and move optional work behind
        a clear milestone.
      </>
    ),
    sections: [
      {
        label: "DECISION",
        topic: (
          <>
            Keep the work that reduces <mark>customer risk</mark> in scope.
          </>
        ),
        detail: "Anything that does not change launch safety can be sequenced later.",
      },
      {
        label: "OWNERSHIP",
        topic: (
          <>
            Give every blocker a <mark>single owner</mark> and a decision deadline.
          </>
        ),
        detail: "That keeps the team from waiting on an unclear handoff.",
      },
      {
        label: "NEXT STEP",
        topic: (
          <>
            Publish the revised plan with one <mark>follow-up checkpoint</mark>.
          </>
        ),
        detail: "Everyone leaves with the same scope, date, and escalation path.",
      },
    ],
  },
];

export default function LiveOverlayDemo() {
  const [active, setActive] = useState(0);
  const scenario = scenarios[active];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % scenarios.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="live-demo">
      <div className="demo-switcher" aria-label="Choose a CueAside demo">
        {scenarios.map((item, index) => (
          <button
            className={index === active ? "selected" : ""}
            key={item.name}
            type="button"
            onClick={() => setActive(index)}
            aria-pressed={index === active}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div
        className="real-overlay"
        aria-label={`CueAside ${scenario.name.toLowerCase()} demo`}
      >
        <div className="overlay-controls">
          <div className="overlay-status-row">
            <span className="live-dot" />
            <div className="overlay-state">
              <div>
                <strong>Answering</strong>
                <span>{scenario.mode}</span>
              </div>
              <small>Answer ready</small>
            </div>
            <div className="overlay-spacer" />
            <span className="timer-pill">00:04</span>
            <button aria-label="Dashboard">⌂</button>
            <button aria-label="End session">◉</button>
          </div>

          <div className="overlay-action-row">
            <div className="overlay-spacer" />
            <button className="active-control" aria-label="Listening">
              ◼
            </button>
            <button aria-label="Record">●</button>
            <button aria-label="Scan">⌗</button>
            <button aria-label="Peek">◌</button>
            <button className="blue-control" aria-label="Coding mode">
              ⌨
            </button>
          </div>
        </div>

        <div className="overlay-panel question-panel">
          <div className="overlay-panel-title">
            <span>QUESTION</span>
            <span>Transcript</span>
          </div>
          <div className="question-surface" key={`question-${active}`}>
            {scenario.question}
          </div>
        </div>

        <div className="overlay-panel answer-panel">
          <div className="overlay-panel-title">
            <span>ANSWER</span>
            <span>⌘↑ / ⌘↓ scroll</span>
          </div>
          <div className="answer-surface demo-answer" key={`answer-${active}`}>
            <p className="answer-lead">
              <small>START HERE</small>
              <span className="lead-copy">{scenario.opening}</span>
            </p>
            <div className="answer-flow">
              {scenario.sections.map((section) => (
                <p key={section.label}>
                  <small>{section.label}</small>
                  <span className="topic-copy">{section.topic}</span>
                  <span className="detail-copy">{section.detail}</span>
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="overlay-bottom-bar">
          <button className="run-button">ϟ&nbsp;&nbsp;Run</button>
          <button>↻&nbsp;&nbsp;Retry</button>
          <button>‹</button>
          <button>›</button>
          <button>Clear</button>
          <span />
          <button>?</button>
        </div>

        <div className="opacity-control">
          <span>◐</span>
          <b>Opacity</b>
          <span className="slider">
            <i />
          </span>
          <code>70%</code>
          <button>0%</button>
          <button className="opacity-active">70%</button>
        </div>
      </div>
    </div>
  );
}
