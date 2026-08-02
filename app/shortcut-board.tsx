"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The real keyboard map, playable. Every binding below is read straight from
 * the shipping app's hotkey table — nothing aspirational. Clicking a row
 * acts it out on the mini overlay so the keyboard-first design is something
 * you feel instead of a list you skim.
 */

type Fx =
  | "session"
  | "listen"
  | "run"
  | "clear"
  | "peek"
  | "code"
  | "scroll"
  | "nudge"
  | "attach";

const SHORTCUTS: { keys: string; label: string; fx: Fx }[] = [
  { keys: "⌘J", label: "Start / end the session", fx: "session" },
  { keys: "⌘L", label: "Start / stop listening", fx: "listen" },
  { keys: "⌘↩", label: "Run — answer what was heard", fx: "run" },
  { keys: "⌘K", label: "Clear the overlay", fx: "clear" },
  { keys: "⌘P", label: "Peek — hide and bring back instantly", fx: "peek" },
  { keys: "⌘;", label: "Code overlay · click-through", fx: "code" },
  { keys: "⌘↑ ⌘↓", label: "Scroll the answer", fx: "scroll" },
  { keys: "⌃⌥ + arrows", label: "Nudge the overlay around the screen", fx: "nudge" },
  { keys: "⇧⌘S", label: "Attach a screenshot to the question", fx: "attach" },
];

export default function ShortcutBoard() {
  const [fx, setFx] = useState<Fx | null>(null);
  // Remount key: bumping it restarts the CSS animation even when the same
  // shortcut is clicked twice in a row.
  const [tick, setTick] = useState(0);
  const [pressed, setPressed] = useState<Fx | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  function play(next: Fx) {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }
    setPressed(next);
    setFx(next);
    setTick((t) => t + 1);
    timer.current = window.setTimeout(() => setPressed(null), 1400);
  }

  return (
    <div className="board">
      <div className="board-list" role="group" aria-label="Real keyboard shortcuts, click to preview">
        <span className="board-title mono">The real bindings · from the shipping build</span>
        {SHORTCUTS.map((item) => (
          <button
            key={item.fx}
            type="button"
            aria-pressed={pressed === item.fx}
            onClick={() => play(item.fx)}
          >
            <kbd>{item.keys}</kbd>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="board-stage" aria-hidden="true">
        <div key={tick} className={`board-card${fx ? ` fx-${fx}` : ""}`}>
          <div className="stage-bar">
            <span className="stage-live" />
            <b className="board-status">
              {fx === "listen"
                ? "Listening…"
                : fx === "session"
                  ? "Session started"
                  : fx === "code"
                    ? "Click-through"
                    : "Ready"}
            </b>
            <span className="stage-chip">EN · BALANCED</span>
            <span className="spacer" />
            <span className="stage-chip dim">Opacity {fx === "code" ? 30 : 70}%</span>
          </div>
          <div className="board-wave">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="board-body">
            <p className="board-lead">
              <small>START HERE</small>
              <span>Answer will appear here…</span>
            </p>
            <p className="board-line" />
            <p className="board-line short" />
          </div>
          <div className="board-shot">⇧⌘S · screenshot attached</div>
        </div>
        <p className="board-note mono">
          Drawn preview — the labels and keys are the app&rsquo;s own.
        </p>
      </div>
    </div>
  );
}
