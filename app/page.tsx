/* eslint-disable @next/next/no-img-element */

import EarlyAccessForm from "./early-access-form";
import ScrollFX from "./scroll-fx";
import ServerLedger from "./server-ledger";

/*
 * The page is a disclosure document. Two rules for anyone editing it:
 *  1. Every factual claim must be checkable in the app, the public schema, or
 *     the privacy policy. If it isn't, cut it.
 *  2. No testimonials, user counts, logos, or ratings until they are real,
 *     named with permission, and dated.
 */

const DOC_DATE = "July 30, 2026";
const DOC_VERSION = "v1.0";
// Replace with the name or handle you want on the public page.
const SIGNATORY = "Yachen";

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
  return (
    <main>
      <ScrollFX />

      <header className="masthead">
        <div className="masthead-inner">
          <a className="masthead-brand" href="#top">
            <img src="/cueaside-icon.png" alt="" width={28} height={28} />
            CueAside
          </a>
          <nav className="masthead-nav" aria-label="Document sections">
            <a href="#ledger">Ledger</a>
            <a href="#stance">Stance</a>
            <a href="#limits">Limits</a>
            <a href="#price">Price</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="masthead-cta" href="#early-access">
            Join early access
          </a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-eyebrow mono">
          macOS · Early access · Built by one developer
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
          CueAside listens on your Mac, catches the question, and turns it into
          one answer you can say naturally — an opening line first, then a clear
          path underneath it. It never joins your meeting.{" "}
          <strong>Our servers never keep a word you say.</strong> Everything
          they do keep is printed on this page.
        </p>
        <EarlyAccessForm source="landing-hero" />
        <a className="hero-secondary" href="#ledger">
          Read the Server Ledger ↓
        </a>

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
        <b>Works alongside Zoom, Google Meet, Teams, Webex and Slack</b> —
        because it only listens to the Mac audio input you choose. Nothing to
        install inside the call. No bot in the participant list.
      </div>

      <Clause
        id="answer"
        number="01"
        title="What you see when it matters."
        lede={
          <>
            <p className="clause-lede">
              A hard question lands. You have about three seconds before the
              silence starts working against you. CueAside spends them for you:
              one opening sentence you can say immediately, then the structure
              underneath it if the room wants more.
            </p>
            <p className="clause-lede">
              Not a chat log. Not a wall of text you would have to read out
              loud. One answer, shaped for a mouth instead of a screen.
            </p>
          </>
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
        title="The whole mechanism, annotated."
        lede={
          <p className="clause-lede">
            Four steps, no hidden fifth one. This is the entire path your words
            take, including the part where they stop.
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

        <ul className="footnotes">
          <li>
            <b>1.</b> The production schema has tables for billing, daily usage
            counts and rate limits. There is no table for transcripts, prompts
            or answers.
          </li>
          <li>
            <b>2.</b> <code>store: false</code> instructs the AI provider not to
            retain the request.
          </li>
          <li>
            <b>3.</b> Abuse identifiers are HMAC hashes of your account id. The
            provider never receives your email address.
          </li>
          <li>
            <b>4.</b> Sessions live in the app on your Mac. Delete them there
            and they are gone.
          </li>
        </ul>
      </Clause>

      <Clause
        id="ledger"
        number="03"
        title="The Server Ledger."
        lede={
          <p className="clause-lede">
            Most products in this category describe their privacy in adjectives.
            Here is ours as a count. Three kinds of record are kept about you.
            None of them are your words.
          </p>
        }
      >
        <ServerLedger full />
        <p className="ledger-caption">
          Where every other product in this category puts a glowing screenshot,
          we put the retention list. Each row maps to a table in the public
          schema.
        </p>

        <div className="ledger-notes">
          <div>
            <h3>What store:false means</h3>
            <p>
              Every answer request is sent to the AI provider with retention
              turned off, and our own servers never write it down. When the
              answer reaches your screen, the request is over — there is nothing
              left to leak, subpoena, or accidentally train on.
            </p>
          </div>
          <div>
            <h3>What the counters are for</h3>
            <p>
              Three numbers per day — answers, transcriptions, realtime tokens —
              exist so fair-use limits work and one account can&rsquo;t melt the
              service. They are counts, not contents.
            </p>
          </div>
          <div>
            <h3>Where your material lives</h3>
            <p>
              The resume, notes and briefs you prepare, plus your session
              history, stay in the app on your Mac. They are never uploaded to a
              CueAside database.
            </p>
          </div>
          <div>
            <h3>How to check any of this</h3>
            <p>
              The database schema is committed in the public repository and the{" "}
              <a className="inline-link" href="/privacy/">
                privacy policy
              </a>{" "}
              says the same thing in prose. If a claim on this page isn&rsquo;t
              checkable in the app, the schema, or that policy, tell me and
              I&rsquo;ll fix the page.
            </p>
          </div>
        </div>
      </Clause>

      <Clause
        id="stance"
        number="04"
        title="Where we stand."
        lede={
          <>
            <p className="clause-lede">
              The best-funded product in this category tells you to cheat on
              everything. Across the category, &ldquo;undetectable&rdquo; is
              literally the premium tier — one product charges roughly seven
              times its normal price for it, and another asks a few hundred
              dollars a month.
            </p>
            <p className="clause-lede">
              That is a business built on your fear of being caught. This one is
              built on the opposite bet: most people don&rsquo;t want to be
              someone else in the room. They want to be themselves without
              freezing.
            </p>
          </>
        }
      >
        <p>
          Every keynote speaker on earth reads from notes the audience never
          sees. A teleprompter isn&rsquo;t a lie — pretending to be someone you
          aren&rsquo;t is. CueAside is presenter notes for a conversation:{" "}
          <strong>your own preparation, surfaced at the moment you need it.</strong>{" "}
          The material it uses is the material you gave it.
        </p>

        <ol className="numbered">
          <li>
            <div>
              <b>It never joins your meeting, speaks, or impersonates you.</b>
              <span>
                No bot in the participant list, no calendar scopes, no
                integration to grant. It hears what your Mac hears and that is
                all it does.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>The servers never keep your words.</b>
              <span>
                Not the audio, not the transcript, not the answer. The ledger
                above is the whole list, and the schema behind it is public.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>Stealth will never be a paid tier here.</b>
              <span>
                We will not build a feature whose value is that someone else
                can&rsquo;t tell, and then charge you extra for it.
              </span>
            </div>
          </li>
        </ol>

        <p style={{ marginTop: "34px" }}>
          <strong>On discretion.</strong> The overlay stays out of supported
          screen captures the way presenter notes stay off the projector. That
          is discretion for your own notes — and it will never be marketed as a
          way to deceive anyone.
        </p>
        <p>
          <strong>On consent.</strong>{" "}
          Rules about recording and transcribing
          conversations vary by region, and some require everyone&rsquo;s
          agreement. Know the rules that apply to you before using any tool that
          listens. A good test: if someone asked what was on your screen, you
          should be able to answer.
        </p>
      </Clause>

      <Clause
        id="limits"
        number="05"
        title="What it won't do."
        lede={
          <p className="clause-lede">
            Every other page in this category lists what the product does. This
            is the list I would want to read first.
          </p>
        }
      >
        <ol className="numbered">
          <li>
            <div>
              <b>It won&rsquo;t answer for you.</b>
              <span>
                It suggests; you speak. Nothing reaches the other person except
                what comes out of your mouth.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>It won&rsquo;t make you sound like you know something you
              don&rsquo;t.</b>
              <span>
                Interviews have follow-up questions. This is built for retrieval
                under pressure, not for pretending.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>It won&rsquo;t read well if you recite it.</b>
              <span>
                The answers are written to be spoken from, not read out. Read
                one word-for-word and you will sound like someone reading.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>It won&rsquo;t rescue an unprepared call.</b>
              <span>
                Answers are grounded in the context you provide. Give it
                nothing, and you get something generic — the same thing any chat
                window would have told you.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>It won&rsquo;t run on Windows.</b>
              <span>
                It is a native macOS app. That is a real limitation and not a
                positioning statement.
              </span>
            </div>
          </li>
        </ol>
      </Clause>

      <Clause
        id="languages"
        number="06"
        title="Alongside, not inside — in eleven languages."
        lede={
          <p className="clause-lede">
            It works with every call app because it works with none of them. And
            because the answer is built for speaking, the language it&rsquo;s
            built in matters more than usual.
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

        <blockquote className="vignette">
          You did the work in your first language. The interview is in your
          second. The answer arrives phrased the way that language is actually
          spoken — and the technical terms stay exactly as precise as they were.
          <small>Illustrative scenario, not a customer quote</small>
        </blockquote>
      </Clause>

      <Clause
        id="settings"
        number="07"
        title="Your settings. Your Mac."
        lede={
          <p className="clause-lede">
            Everything that shapes an answer is set by you, before the
            conversation starts. The more context you give it, the more the
            answers sound like your preparation — because they are built from
            it.
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
        id="build"
        number="08"
        title="The state of the build."
        lede={
          <p className="clause-lede">
            Early access means the honest version of a launch: some of this is
            finished, some of it isn&rsquo;t, and you deserve to know which is
            which before you hand over an email address.
          </p>
        }
      >
        <div className="signed-note">
          <p>
            I build CueAside alone. What works today: the macOS app, the
            overlay, the eleven answer languages, coding mode, local session
            history, and the hosted API with email-code sign-in and
            subscriptions.
          </p>
          <p>
            What doesn&rsquo;t exist yet: public checkout — it opens inside the
            app when early access ends — a Windows version, and everything on
            the roadmap I haven&rsquo;t earned the right to promise. When those
            change, this clause changes with them.
          </p>

          <div className="statement">
            <p>
              THIS PAGE HAS NO TESTIMONIALS, NO USER COUNTS, NO COMPANY LOGOS
              AND NO RATINGS — BECAUSE THERE ARE NO CUSTOMERS YET.
            </p>
            <p>
              WHEN THERE ARE, THE QUOTES WILL BE REAL, NAMED WITH PERMISSION,
              AND DATED. COMPARE THAT POLICY WITH ANYONE ELSE IN THIS MARKET.
            </p>
          </div>

          <div className="signature">
            — {SIGNATORY}, building CueAside
            <small>
              {DOC_DATE} · Page copy {DOC_VERSION} · Every claim above maps to
              the app, the public schema, or the privacy policy
            </small>
          </div>
        </div>
      </Clause>

      <Clause
        id="price"
        number="09"
        title="One plan, priced like software."
        lede={
          <p className="clause-lede">
            The price doesn&rsquo;t exist yet. The shape of the deal does, and
            publishing it now is the only way it can be held against me later.
          </p>
        }
      >
        <div className="pledge">
          <div className="pledge-row">
            <i>✓</i>
            <div>One subscription with every feature in it. No tier you have
            to reach to get the good version.</div>
          </div>
          <div className="pledge-row">
            <i>✓</i>
            <div>
              No stealth surcharge. Elsewhere, being undetectable is the
              expensive tier; here it isn&rsquo;t a product at all.
            </div>
          </div>
          <div className="pledge-row">
            <i>✓</i>
            <div>
              No credit packs, no struck-through anchor prices, no
              annual-only arithmetic designed to make a number look smaller.
            </div>
          </div>
          <div className="pledge-row">
            <i>✓</i>
            <div>
              Checkout happens inside the app through Stripe. Cancel from the
              Stripe billing portal — no email, no phone call, no retention
              gauntlet.
            </div>
          </div>
          <div className="pledge-price">
            <span>Monthly price</span>
            <b>$ ——— / month</b>
            <small>
              The price will be printed here, in this font, before anyone is
              charged. People on the early-access list hear it first.
            </small>
          </div>
        </div>
      </Clause>

      <Clause
        id="faq"
        number="10"
        title="Signature."
        lede={
          <p className="clause-lede">
            Seven questions that decide whether this is for you, answered
            without the marketing voice.
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
              questions. Rules differ by employer, school and interviewer;
              knowing yours is your call, and clause 04 is where we stand.
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
              It&rsquo;s in early access now. Join the list and you get the
              download link and the price before anyone is charged. Checkout
              opens inside the app through Stripe when early access ends.
            </p>
          </details>
        </div>
      </Clause>

      <section className="closing" id="early-access">
        <div className="mono" style={{ color: "var(--ink-faint)" }}>
          CueAside for macOS · Early access
        </div>
        <h2>Speak clearly before the moment moves on.</h2>
        <p>
          Leave an email and you&rsquo;ll get the download link and the price
          before anyone is charged. That address is one of the three things
          these servers hold, and you can have it deleted by asking.
        </p>
        <EarlyAccessForm
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
        <span>
          {DOC_VERSION} · {DOC_DATE}
        </span>
      </footer>
    </main>
  );
}
