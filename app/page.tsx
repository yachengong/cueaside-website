/* eslint-disable @next/next/no-img-element */

import { publicBetaDownload } from "@/lib/public-beta";
import BetaAccess from "./beta-access";
import ScrollFX from "./scroll-fx";
import ServerLedger from "./server-ledger";

/*
 * The public landing page follows two rules:
 *  1. Every factual claim must be checkable in the app, the public schema, or
 *     the privacy policy. If it isn't, cut it.
 *  2. No testimonials, user counts, logos, or ratings until they are real,
 *     named with permission, and dated.
 */

const LANGUAGES = [
  "English",
  "中文",
  "Español",
  "Français",
  "Deutsch",
  "日本語",
  "한국어",
  "Português",
  "Italiano",
  "हिन्दी",
  "العربية",
];

function Clause({
  id,
  number,
  title,
  lede,
  children,
}: {
  id: string;
  number: string;
  title: string;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="clause" id={id}>
      <div className="clause-head">
        <div className="clause-number" data-n={number}>
          Clause {number}
        </div>
        <div>
          <h2 className="clause-title">{title}</h2>
          {lede}
        </div>
      </div>
      {children ? <div className="clause-body">{children}</div> : null}
    </section>
  );
}

export default function Home() {
  const beta = publicBetaDownload();

  return (
    <main>
      <ScrollFX />

      <header className="masthead">
        <div className="masthead-inner">
          <a className="masthead-brand" href="#top">
            <img src="/cueaside-icon.png" alt="" width={28} height={28} />
            CueAside
          </a>
          <nav className="masthead-nav" aria-label="Page sections">
            <a href="#answer">Product</a>
            <a href="#mechanism">How it works</a>
            <a href="#ledger">Privacy</a>
            <a href="#languages">Languages</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="masthead-cta" href={beta ? "#download" : "#early-access"}>
            {beta ? "Download beta" : "Join early access"}
          </a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-eyebrow mono">
          Native macOS · Early access
        </div>
        <h1>
          {"Know what to say while".split(" ").map((word, index) => (
            <span
              className="w"
              key={index}
              style={{ animationDelay: `${80 * index}ms` }}
            >
              {word}
              {" "}
            </span>
          ))}
          {"the conversation is moving.".split(" ").map((word, index) => (
            <span
              className="w grad"
              key={`g${index}`}
              style={{ animationDelay: `${400 + 80 * index}ms` }}
            >
              {word}
              {index < 3 ? " " : ""}
            </span>
          ))}
        </h1>
        <p className="hero-sub">
          CueAside catches the question and gives you a natural opening line,
          followed by a clear path when you need more. It works alongside the
          conversation without joining the call.
        </p>
        <BetaAccess source="landing-hero" />
        <p className="hero-trust">
          <span aria-hidden="true">●</span>
          Audio, transcripts, and answers are never stored on CueAside servers.
        </p>

        <figure className="real-product-shot hero-product-shot">
          <div className="product-shot-glow" aria-hidden="true" />
          <img
            src="/cueaside-overlay-real.png"
            alt="The real CueAside macOS overlay showing a general English project question and a structured spoken answer."
            width={1240}
            height={1290}
          />
          <figcaption>
            <span>Real CueAside interface</span>
            Generic English demonstration content. No personal interview or
            meeting data.
          </figcaption>
        </figure>
      </section>

      <div className="compat-strip">
        <b>Zoom · Google Meet · Teams · Webex · Slack</b>
        <span>Native macOS</span>
        <span>No meeting bot</span>
        <span>No calendar access</span>
      </div>

      <Clause
        id="answer"
        number="01"
        title="One answer, built to be spoken."
        lede={
          <p className="clause-lede">
            Start with the direct sentence. Use the topic path underneath only
            when the conversation asks for more.
          </p>
        }
      >
        <div className="product-proof-grid">
          <div>
            <span>Start speaking</span>
            <b>The first sentence is visually distinct.</b>
            <p>
              You can begin with the direct answer while the supporting path is
              ready underneath it.
            </p>
          </div>
          <div>
            <span>Keep the thread</span>
            <b>Blue topic markers organize the answer.</b>
            <p>
              Each section gives you the next idea without turning the overlay
              into a script you have to recite.
            </p>
          </div>
          <div>
            <span>Find the anchor</span>
            <b>Key phrases stand out in amber.</b>
            <p>
              The emphasis helps your eyes return to the important point after
              you look back at the other person.
            </p>
          </div>
        </div>
      </Clause>

      <Clause
        id="mechanism"
        number="02"
        title="From question to speaking in four steps."
        lede={
          <p className="clause-lede">
            The complete path is short, visible, and controlled from your Mac.
          </p>
        }
      >
        <div className="flow">
          <div className="flow-node">
            <span>Step 1</span>
            <b>Your Mac</b>
            <p>
              CueAside listens to the audio input you pick and detects when a
              real question has landed.
            </p>
          </div>
          <div className="flow-node">
            <span>Step 2</span>
            <b>CueAside API</b>
            <p>
              Checks your subscription, adds one to a daily counter, and passes
              the request through. There is no table to store it in.<sup>1</sup>
            </p>
          </div>
          <div className="flow-node">
            <span>Step 3</span>
            <b>The model</b>
            <p>
              Proxied server-side with store:false.<sup>2</sup> Your account
              arrives as a hash, never as your email.<sup>3</sup>
            </p>
          </div>
          <div className="flow-node">
            <span>Step 4</span>
            <b>Your screen</b>
            <p>
              One answer in the overlay. The session Q/A history is written to
              your Mac, not our database.<sup>4</sup>
            </p>
          </div>
        </div>

        <p className="mechanism-note">
          Session history stays on your Mac. AI requests use storage disabled,
          and CueAside keeps only account, subscription, and usage-count data.
        </p>
      </Clause>

      <Clause
        id="ledger"
        number="03"
        title="Your words are not the product."
        lede={
          <p className="clause-lede">
            The complete server record is shown as a count: three account-level
            records, and zero words from your conversations.
          </p>
        }
      >
        <ServerLedger full />
      </Clause>

      <Clause
        id="languages"
        number="04"
        title="Across your calls, in eleven languages."
        lede={
          <p className="clause-lede">
            CueAside listens from macOS, so it works without a meeting bot or
            a separate integration for every call app.
          </p>
        }
      >
        <div className="split">
          <div>
            <div className="mono" style={{ color: "var(--ink-faint)" }}>
              No integration required
            </div>
            <ul className="plain-list">
              <li>Zoom · Google Meet · Microsoft Teams · Webex · Slack</li>
              <li>Phone calls, in-person conversations, anything audible</li>
              <li>No meeting bot, no calendar access, no OAuth grants</li>
              <li>Nothing installed inside the call app</li>
            </ul>
          </div>
          <div>
            <div className="mono" style={{ color: "var(--ink-faint)" }}>
              Eleven answer languages
            </div>
            <div className="lang-marquee">
              <div className="lang-track">
                {[...LANGUAGES, ...LANGUAGES].map((language, index) => (
                  <span
                    className="lang-chip"
                    key={index}
                    aria-hidden={index >= LANGUAGES.length}
                  >
                    {language}
                  </span>
                ))}
              </div>
              <div className="lang-track reverse" aria-hidden="true">
                {[...LANGUAGES, ...LANGUAGES]
                  .reverse()
                  .map((language, index) => (
                    <span className="lang-chip" key={index}>
                      {language}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </Clause>

      <Clause
        id="settings"
        number="05"
        title="Tune speed, language, and context."
        lede={
          <p className="clause-lede">
            Choose how quickly CueAside answers and what preparation it should
            use before the conversation begins.
          </p>
        }
      >
        <div className="settings-figure">
          <div>
            <span>Role &amp; context</span>
            <b>What you brought</b>
            <p>
              Resume, project stories, meeting notes, the role you&rsquo;re
              interviewing for. Context can be switched off entirely for a
              conversation where you don&rsquo;t want it used.
            </p>
          </div>
          <div>
            <span>Answer language</span>
            <b>The one you&rsquo;ll be speaking</b>
            <p>
              Eleven options, each with its own speaking style. Standard
              technical terms are kept precise rather than translated into
              something that sounds odd out loud.
            </p>
          </div>
          <div>
            <span>Thinking depth</span>
            <b>Speed against consideration</b>
            <p>
              Four settings, from an instant opening line to a slower answer
              that surfaces the tradeoff you&rsquo;re about to be asked about.
            </p>
            <div className="depth-scale">
              <i>Instinct</i>
              <i>Balanced</i>
              <i>Precise</i>
              <i>Thinking</i>
            </div>
          </div>
          <div>
            <span>Sessions</span>
            <b>Stored on this Mac</b>
            <p>
              Each session keeps its questions and answers so you can review
              them afterwards. They are files on your machine, not rows in our
              database.
            </p>
          </div>
        </div>
      </Clause>

      <Clause
        id="faq"
        number="06"
        title="Questions before you try it."
        lede={
          <p className="clause-lede">
            The practical answers about calls, privacy, consent, and access.
          </p>
        }
      >
        <div className="faq">
          <details open>
            <summary>Is this cheating?</summary>
            <p>
              It&rsquo;s presenter notes. CueAside surfaces the preparation you
              gave it — your own experience, your own material — at the moment
              you need it, and you decide what to say. It cannot make you
              someone who knows the answer, and interviews have follow-up
              questions. Rules differ by employer, school and interviewer, so
              check the policy that applies to your conversation.
            </p>
          </details>
          <details>
            <summary>Does it join my call?</summary>
            <p>
              Never. It listens to the audio input you choose on your Mac. There
              is no bot in the participant list, no calendar access, and nothing
              to install inside Zoom, Meet, Teams, Webex or Slack.
            </p>
          </details>
          <details>
            <summary>What do your servers keep?</summary>
            <p>
              Your email address, your subscription record, and three daily
              request counters. Not your audio, transcripts, questions, answers,
              resume, notes or context. The ledger in clause 03 is the complete
              list and the schema behind it is public.
            </p>
          </details>
          <details>
            <summary>What about recording consent?</summary>
            <p>
              Rules vary by region and some require every participant to agree.
              CueAside listens to your Mac&rsquo;s audio input, which makes you
              responsible for knowing the rules that apply to your
              conversations. We publish guidance rather than pretending the
              question doesn&rsquo;t exist.
            </p>
          </details>
          <details>
            <summary>Which languages does it answer in?</summary>
            <p>
              English, Chinese, Spanish, French, German, Japanese, Korean,
              Portuguese, Italian, Hindi and Arabic — each with its own speaking
              style, with standard technical terms kept precise.
            </p>
          </details>
          <details>
            <summary>What does it need to run?</summary>
            <p>
              A Mac on macOS 15.3 or later. It is a native app — no Windows
              version, no web version of the overlay. Microphone access is
              required to hear the conversation; Accessibility permission
              powers the global shortcuts.
            </p>
          </details>
          <details>
            <summary>When can I get it, and what will it cost?</summary>
            <p>
              It&rsquo;s in early access now. {beta ? (
                <>Download the private beta here; no one is charged during early access.</>
              ) : (
                <>Join the list and you get the download link and the price before anyone is charged.</>
              )}{" "}
              Checkout opens inside the app through Stripe when early access
              ends.
            </p>
          </details>
        </div>
      </Clause>

      <section className="closing" id={beta ? "download" : "early-access"}>
        <div className="mono" style={{ color: "var(--ink-faint)" }}>
          CueAside for macOS · Early access
        </div>
        <h2>Speak clearly before the moment moves on.</h2>
        <p>
          {beta
            ? "Download the private beta and follow the two-minute installation guide. Early-access builds are free."
            : "Leave an email and you’ll get the download link and the price before anyone is charged. That address is one of the three things these servers hold, and you can have it deleted by asking."}
        </p>
        <BetaAccess
          source="landing-closing"
          note="No sequence, no newsletter, no partner emails. The download link and the price."
        />
      </section>

      <footer className="doc-footer">
        <span>© 2026 CueAside · macOS</span>
        <nav>
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
          <a
            href="https://github.com/yachengong/cueaside-website"
            target="_blank"
            rel="noreferrer"
          >
            Public schema
          </a>
        </nav>
        <span>Early access · August 2026</span>
      </footer>
    </main>
  );
}
