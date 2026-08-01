"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * The hero is the product, live and playable: a drawn-in-code meeting window
 * with the CueAside glass overlay on top. It loops through three scenarios on
 * its own, and the question chips underneath let the visitor trigger any
 * scenario by hand. Server-rendered fully answered, so with no JavaScript —
 * or reduced motion — the card is simply complete.
 */

type Segment = { t: string; hl?: boolean };

type Scenario = {
  key: string;
  pick: string;
  chip: string;
  question: string;
  lead: Segment[];
  points: { label: string; text: string }[];
};

const SCENARIOS: Scenario[] = [
  {
    key: "behavioral",
    pick: "Behavioral",
    chip: "EN · BALANCED",
    question: "Tell me about a time you disagreed with your team.",
    lead: [
      { t: "We split on " },
      { t: "rewriting the pipeline", hl: true },
      { t: " — I asked for a two-week test before we committed." },
    ],
    points: [
      {
        label: "THE CALL",
        text: "Same symptom, two prices: a rewrite is a quarter, a bad join is an afternoon.",
      },
      {
        label: "WHAT I DID",
        text: "Time-boxed profiling, and we agreed which number would settle it.",
      },
      { label: "OUTCOME", text: "p99 dropped 60% — no rewrite needed." },
    ],
  },
  {
    key: "zh",
    pick: "中文面试",
    chip: "中文 · PRECISE",
    question: "说说你最有挑战的一个项目？",
    lead: [
      { t: "我先说结论：" },
      { t: "把评估周期从两周压到一天", hl: true },
      { t: "，靠的是把人工审核拆成可并行的三步。" },
    ],
    points: [
      { label: "背景", text: "旧流程串行走完要十个工作日，客户在流失。" },
      { label: "做法", text: "先量化每一步的耗时，再把规则类判断交给自动化。" },
      { label: "结果", text: "交付周期缩短 90%，错误率没有上升。" },
    ],
  },
  {
    key: "system",
    pick: "System design",
    chip: "EN · THINKING",
    question: "How would you design a rate limiter for our API?",
    lead: [
      { t: "Start with a " },
      { t: "token bucket per key", hl: true },
      { t: ", then decide where the state lives." },
    ],
    points: [
      { label: "LOCAL", text: "In-process buckets are fast but reset on deploy." },
      {
        label: "SHARED",
        text: "Redis with a Lua script keeps the check atomic across nodes.",
      },
      {
        label: "TRADEOFF",
        text: "Name the burst you allow — that is the real product decision.",
      },
    ],
  },
];

type Phase = "typing" | "thinking" | "answer" | "fading";

const BARS = Array.from({ length: 26 }, (_, i) => i);

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HeroStage() {
  const first = SCENARIOS[0];
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(first.question.length);
  const [shown, setShown] = useState(1 + first.points.length);
  const [phase, setPhase] = useState<Phase>("answer");
  const scene = useRef<HTMLDivElement>(null);
  const requested = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion()) {
      return;
    }

    let dead = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    // Sleeps between animation beats are short so a click is picked up fast.
    const interrupted = () => requested.current !== null;

    (async () => {
      // Let the server-rendered "answer ready" state breathe first.
      for (let waited = 0; waited < 2000 && !interrupted(); waited += 100) {
        await sleep(100);
        if (dead) return;
      }

      let next = 1;
      while (!dead) {
        let target: number;
        if (requested.current !== null) {
          target = requested.current;
          requested.current = null;
        } else {
          target = next % SCENARIOS.length;
          next += 1;
        }
        const scenario = SCENARIOS[target];

        setPhase("fading");
        await sleep(460);
        if (dead) return;

        setIndex(target);
        setTyped(0);
        setShown(0);
        setPhase("typing");
        for (let c = 1; c <= scenario.question.length; c++) {
          await sleep(28);
          if (dead) return;
          if (interrupted()) break;
          setTyped(c);
        }
        if (interrupted()) continue;

        setPhase("thinking");
        await sleep(760);
        if (dead) return;
        if (interrupted()) continue;

        setPhase("answer");
        setShown(1);
        for (let p = 1; p <= scenario.points.length; p++) {
          await sleep(320);
          if (dead) return;
          if (interrupted()) break;
          setShown(1 + p);
        }

        // Hold the finished answer, but stay responsive to clicks.
        for (let held = 0; held < 3600 && !interrupted(); held += 100) {
          await sleep(100);
          if (dead) return;
        }
      }
    })();

    return () => {
      dead = true;
    };
  }, []);

  function pick(i: number) {
    if (reducedMotion()) {
      // No animation loop running — cut straight to the finished answer.
      setIndex(i);
      setTyped(SCENARIOS[i].question.length);
      setShown(1 + SCENARIOS[i].points.length);
      setPhase("answer");
      return;
    }
    requested.current = i;
  }

  function tilt(event: ReactPointerEvent<HTMLDivElement>) {
    const node = scene.current;
    if (!node || reducedMotion()) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--ry", `${(x * 5).toFixed(2)}deg`);
    node.style.setProperty("--rx", `${(-y * 5).toFixed(2)}deg`);
  }

  function untilt() {
    const node = scene.current;
    if (node) {
      node.style.setProperty("--ry", "0deg");
      node.style.setProperty("--rx", "0deg");
    }
  }

  const scenario = SCENARIOS[index];
  const typing = phase === "typing";
  const listening = typing || phase === "thinking";
  const status =
    phase === "typing"
      ? "Hearing the question"
      : phase === "thinking"
        ? "Thinking…"
        : "Answer ready";

  return (
    <div className="hero-stage">
      <div
        ref={scene}
        className="stage-scene"
        role="img"
        aria-label="Illustrative loop: a video call is running, and the CueAside overlay on top hears the question and drafts one speakable answer."
        onPointerMove={tilt}
        onPointerLeave={untilt}
      >
        <div aria-hidden="true">
          <div className="scene-window">
            <div className="scene-titlebar">
              <i />
              <i />
              <i />
              <span>Final round · video call</span>
              <em>41:32</em>
            </div>
            <div className="scene-tiles">
              <div className={`scene-tile${listening ? " speaking" : ""}`}>
                <b>MK</b>
                <span>Interviewer</span>
              </div>
              <div className="scene-tile you">
                <b>YOU</b>
                <span>Mic on</span>
              </div>
            </div>
            <div className="scene-caption">
              {listening
                ? "Interviewer is speaking…"
                : "Your turn — say the first sentence."}
            </div>
          </div>

          <div className={`stage-card${phase === "fading" ? " is-fading" : ""}`}>
            <div className="stage-bar">
              <span className={`stage-live${listening ? " hot" : ""}`} />
              <b>{status}</b>
              <span className="stage-chip">{scenario.chip}</span>
              <span className="spacer" />
              <span className="stage-chip dim">not in the call</span>
            </div>

            <div className={`stage-wave${typing ? " hot" : ""}`}>
              {BARS.map((bar) => (
                <i key={bar} />
              ))}
            </div>

            <div className="stage-field">
              <span>Question · heard live</span>
              <div className="stage-question">
                {scenario.question.slice(0, typed)}
                {typing ? <i className="caret" /> : null}
              </div>
            </div>

            <div className="stage-field">
              <span>Answer · built to be spoken</span>
              <div className="stage-answer">
                <p className={`stage-lead${shown >= 1 ? " on" : ""}`}>
                  <small>START HERE</small>
                  <span>
                    {scenario.lead.map((seg, i) =>
                      seg.hl ? <mark key={i}>{seg.t}</mark> : seg.t,
                    )}
                  </span>
                </p>
                {scenario.points.map((point, i) => (
                  <p
                    className={`stage-point${shown >= i + 2 ? " on" : ""}`}
                    key={point.label}
                  >
                    <small>{point.label}</small>
                    <b>{point.text}</b>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="stage-tryline">
        <span className="stage-try mono">Try it — throw it a question</span>
        <div className="stage-picks" role="group" aria-label="Demo scenarios">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={i === index}
              onClick={() => pick(i)}
            >
              {s.pick}
            </button>
          ))}
        </div>
        <p className="stage-caption">
          Illustrative loop, drawn in code — not a screen recording.
        </p>
      </div>
    </div>
  );
}
