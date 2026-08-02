"use client";

import { useState } from "react";

/**
 * The Screenshot Test — the product-shot slot, answered honestly.
 *
 * We ran the real build and pointed macOS's own screenshot tool at the
 * overlay window. It refused. So instead of a glowing screenshot, this slot
 * holds a switchable re-enactment of that experiment plus the tool's
 * verbatim refusal. The scene is drawn in code and labeled as such; the
 * terminal output is real.
 */

type View = "you" | "share";

export default function CaptureTest() {
  const [view, setView] = useState<View>("you");
  const sharing = view === "share";

  return (
    <section className="product-frame-section" aria-label="The screenshot test">
      <div className="ct-head">
        <h2>
          We tried to put a real screenshot here.{" "}
          <span className="grad">macOS refused.</span>
        </h2>
        <p>
          The overlay excludes itself from screen capture — the same exclusion
          Zoom, Meet and OBS honor. We ran the real build and asked macOS to
          photograph it anyway. Flip the view to see both sides of the call:
        </p>
      </div>

      <div className="ct-toggle" role="group" aria-label="Pick a point of view">
        <button
          type="button"
          aria-pressed={!sharing}
          onClick={() => setView("you")}
        >
          Your screen
        </button>
        <button
          type="button"
          aria-pressed={sharing}
          onClick={() => setView("share")}
        >
          What the screen share sees
        </button>
      </div>

      <div className="ct-stage" aria-hidden="true">
        <div className={`ct-window${sharing ? " is-sharing" : ""}`}>
          <div className="scene-titlebar">
            <i />
            <i />
            <i />
            <span>Final round · video call</span>
            {sharing ? <b className="ct-rec">● Sharing screen</b> : null}
            <em>42:07</em>
          </div>
          <div className="scene-tiles">
            <div className="scene-tile speaking">
              <b>MK</b>
              <span>Interviewer · speaking</span>
            </div>
            <div className="scene-tile you">
              <b>YOU</b>
              <span>Mic on</span>
            </div>
          </div>
          <div className="scene-caption">
            {sharing
              ? "The call, the tiles, your face — everything except one window."
              : "Same call, seen from your chair."}
          </div>

          <div className={`ct-overlay${sharing ? " is-gone" : ""}`}>
            <div className="stage-bar">
              <span className="stage-live" />
              <b>Answer ready</b>
              <span className="stage-chip">EN · BALANCED</span>
              <span className="spacer" />
              <span className="stage-chip dim">Opacity 70%</span>
            </div>
            <div className="stage-answer">
              <p className="stage-lead on">
                <small>START HERE</small>
                <span>
                  Presenter notes for a conversation — visible in exactly one
                  place: your own screen.
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="ct-proof">
        <div className="ct-term" role="img" aria-label="Terminal transcript: screencapture refuses to image the overlay window">
          <div className="ct-term-bar">
            <span>Terminal — verbatim</span>
            <em>real build · July 31, 2026</em>
          </div>
          <pre>
            <code>
              <span className="ct-prompt">$</span> screencapture -l
              &lt;overlay-window-id&gt; proof.png{"\n"}
              <span className="ct-err">could not create image from window</span>
            </code>
          </pre>
        </div>
        <p className="product-frame-caption">
          That refusal is macOS&rsquo;s screenshot tool, unedited, pointed at
          the real app&rsquo;s window. The scene above is drawn in code and
          labeled as such — a real screenshot will sit here the day one can
          exist without breaking the promise that makes the product work.
          Clause 04 covers where discretion ends.
        </p>
      </div>
    </section>
  );
}
