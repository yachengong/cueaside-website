/* eslint-disable @next/next/no-img-element */

import EarlyAccessForm from "./early-access-form";
import LiveOverlayDemo from "./live-overlay-demo";

const Arrow = () => <span aria-hidden="true">→</span>;

const WaveMark = () => (
  <span className="wave-mark" aria-hidden="true">
    <i />
    <i />
    <i />
    <i />
    <i />
  </span>
);

const WindowDots = () => (
  <span className="window-dots" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
);

function RealDashboard() {
  const navItems = [
    ["▦", "Home"],
    ["▤", "Sessions"],
    ["▧", "Context"],
    ["≋", "Audio"],
    ["▯", "Phone"],
    ["⚙", "Settings"],
  ];
  const recentSessions = [
    ["Jul 29 · 10:42", "6 Q/A"],
    ["Jul 28 · 21:17", "3 Q/A"],
    ["Jul 27 · 14:05", "9 Q/A"],
    ["Jul 25 · 16:31", "4 Q/A"],
  ];

  return (
    <div className="real-dashboard" aria-label="CueAside dashboard">
      <div className="dash-titlebar">
        <WindowDots />
      </div>
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="dash-icon">
            <WaveMark />
          </span>
          <div>
            <strong>CueAside</strong>
            <small>Speaking copilot</small>
          </div>
        </div>
        <div className="menu-label">MENU</div>
        <div className="dash-menu">
          {navItems.map(([icon, label], index) => (
            <div className={index === 0 ? "selected" : ""} key={label}>
              <i>{icon}</i>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="dash-session-status">
          <span />
          General · English
        </div>
        <button className="start-session">▶&nbsp;&nbsp;Start Session</button>
      </aside>

      <div className="dash-content">
        <div className="dash-heading">
          <h3>Overview</h3>
          <p>Start a session to open the invisible overlay.</p>
        </div>
        <div className="dash-card session-card">
          <span className="idle-indicator">
            <i />
          </span>
          <div>
            <strong>Session live</strong>
            <p>
              Answers are saved to this session while the overlay stays ready.
            </p>
          </div>
          <span className="sleep-mark">◉</span>
        </div>
        <div className="session-name-demo">
          <small>SESSION NAME</small>
          <div>Architecture interview · July 29</div>
        </div>
        <div className="dash-chips">
          <div>
            <small>ROLE</small>
            <b>DE</b>
          </div>
          <div>
            <small>LANGUAGE</small>
            <b>English</b>
          </div>
          <div>
            <small>CONTEXT</small>
            <b className="context-on">ON</b>
          </div>
        </div>
        <div className="depth-demo">
          <small>THINKING DEPTH</small>
          <div>
            <span>Instinct</span>
            <span className="selected">Balanced</span>
            <span>Precise</span>
            <span>Thinking</span>
          </div>
        </div>
        <div className="recent-heading">
          <b>Recent sessions</b>
          <span>View all</span>
        </div>
        <div className="dash-card recent-card">
          {recentSessions.map(([date, count]) => (
            <div className="recent-row" key={date}>
              <span>{date}</span>
              <span>{count}</span>
              <span>›</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#" aria-label="CueAside home">
          <img
            src="/cueaside-icon.png"
            alt=""
            width={34}
            height={34}
          />
          <span>CueAside</span>
        </a>

        <nav aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#why-cueaside">Why CueAside</a>
          <a href="#faq">FAQ</a>
        </nav>

        <a className="header-cta" href="#early-access">
          Get early access
          <Arrow />
        </a>
      </header>

      <section className="hero" id="product">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="pulse" />
            Live AI help for interviews and meetings
          </div>
          <h1>
            Know what to say.
            <br />
            <span>Right when you need it.</span>
          </h1>
          <p>
            CueAside listens to the conversation and gives you a speaking-ready
            answer in the moment—structured around your own context and easy to
            say out loud.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#early-access">
              Join early access
              <Arrow />
            </a>
            <a className="text-button" href="#how-it-works">
              See how it works
            </a>
          </div>
          <div className="availability">
            <span aria-hidden="true">●</span>
            Early access for macOS
          </div>
        </div>

        <div className="product-stage">
          <div className="stage-label">
            <span />
            Actual CueAside overlay
          </div>
          <LiveOverlayDemo />
        </div>
      </section>

      <section className="trust-row" aria-label="Product attributes">
        <span>Native macOS app</span>
        <i />
        <span>No meeting bot</span>
        <i />
        <span>Context-aware answers</span>
        <i />
        <span>11 spoken languages</span>
      </section>

      <section className="product-truth">
        <div className="section-heading left-heading">
          <div className="eyebrow">The actual product</div>
          <h2>Prepare in the dashboard. Speak from the overlay.</h2>
          <p>
            Set your role, language, context, and thinking depth before the
            conversation. During the call, CueAside keeps the question and one
            guided answer in a focused overlay.
          </p>
        </div>
        <div className="dashboard-stage">
          <div className="stage-label dark-label">
            <span />
            CueAside dashboard
          </div>
          <RealDashboard />
        </div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="section-heading">
          <div className="eyebrow">How it works</div>
          <h2>From preparation to a natural answer.</h2>
        </div>
        <div className="process-grid">
          <article>
            <span className="step-number">01</span>
            <h3>Add your context</h3>
            <p>
              Bring the resume, role, project stories, or meeting notes you
              already prepared.
            </p>
          </article>
          <article>
            <span className="step-number">02</span>
            <h3>Start a session</h3>
            <p>
              CueAside listens alongside your call and recognizes when a real
              question has landed.
            </p>
          </article>
          <article>
            <span className="step-number">03</span>
            <h3>Glance, then speak</h3>
            <p>
              Start with one strong sentence. Follow the short structure only
              when you need it.
            </p>
          </article>
        </div>
      </section>

      <section className="difference-section" id="why-cueaside">
        <div className="difference-copy">
          <div className="eyebrow">Why CueAside</div>
          <h2>Built for the moment you have to answer.</h2>
          <p>
            Generic AI gives you text. CueAside shapes the answer for a live
            conversation: the point comes first, the wording stays simple, and
            precise terms remain precise.
          </p>
        </div>
        <div className="difference-list">
          <article>
            <span>01</span>
            <div>
              <h3>Your material, surfaced at the right moment</h3>
              <p>
                Answers can draw from the context you provide instead of
                inventing a generic story.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>A first sentence you can say immediately</h3>
              <p>
                The opening gives you a clean way into the answer while the
                supporting detail remains available below it.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>One answer you can scan or read</h3>
              <p>
                Each blue point names the topic. Amber key phrases guide your
                eyes while the complete sentence stays easy to read.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="in-the-moment-section">
        <div className="section-heading">
          <div className="eyebrow">Help during the call, not after it</div>
          <h2>Ready before the moment passes.</h2>
          <p>
            CueAside combines live transcription, the context you prepare, and
            a guided answer designed for speaking—not for reading like a chat.
          </p>
        </div>
        <div className="moment-grid">
          <article className="moment-card moment-card-large">
            <div className="moment-icon">◎</div>
            <span className="case-label">NO MEETING BOT</span>
            <h3>Works alongside the conversation.</h3>
            <p>
              CueAside listens from your Mac, so it does not join the attendee
              list or interrupt the call.
            </p>
            <div className="participant-demo">
              <div>
                <span className="participant-avatar">Y</span>
                <p><b>You</b><small>Speaking</small></p>
              </div>
              <div>
                <span className="participant-avatar second">A</span>
                <p><b>Alex</b><small>Interviewer</small></p>
              </div>
              <strong>2 participants · no bot</strong>
            </div>
          </article>

          <article className="moment-card">
            <div className="moment-icon">◌</div>
            <span className="case-label">SCREEN-SHARE AWARE</span>
            <h3>Visible to you, hidden from shared content.</h3>
            <p>
              Keep the overlay near the conversation while CueAside excludes
              its own windows from supported screen captures.
            </p>
          </article>

          <article className="moment-card">
            <div className="moment-icon">文</div>
            <span className="case-label">MULTILINGUAL</span>
            <h3>Answers shaped in the language you speak.</h3>
            <p>
              Eleven language-specific speaking styles keep the phrasing
              natural while standard technical terms stay precise.
            </p>
          </article>
        </div>
      </section>

      <section className="compatibility-section" aria-label="Compatible meeting tools">
        <p>Works wherever the conversation happens</p>
        <div>
          <span>Zoom</span>
          <span>Google Meet</span>
          <span>Microsoft Teams</span>
          <span>Webex</span>
          <span>Slack</span>
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="section-heading left-heading">
          <div className="eyebrow">Private by design</div>
          <h2>Built to help you speak—not to collect your conversations.</h2>
          <p>
            CueAside processes conversations in the moment and keeps almost
            nothing. Here is exactly where your data lives.
          </p>
        </div>
        <div className="privacy-grid">
          <article>
            <span className="privacy-glyph">◇</span>
            <h3>No transcripts on our servers</h3>
            <p>
              Answer requests run with storage disabled. Once your answer is
              delivered, the audio, transcript, and response are gone from our
              side.
            </p>
          </article>
          <article>
            <span className="privacy-glyph">⌂</span>
            <h3>Sessions stay on your Mac</h3>
            <p>
              Your context, notes, and saved Q/A history live in the app on
              your machine—delete them there and they are gone.
            </p>
          </article>
          <article>
            <span className="privacy-glyph">◈</span>
            <h3>Keys never ship in the app</h3>
            <p>
              All AI requests go through the CueAside API. There are no API
              keys inside the macOS app to leak or extract.
            </p>
          </article>
          <article>
            <span className="privacy-glyph">◍</span>
            <h3>Only the minimum on file</h3>
            <p>
              Our servers keep your email, subscription status, and daily
              request counts—numbers, never conversation content.
            </p>
          </article>
        </div>
        <a className="privacy-link" href="/privacy/">
          Read the full privacy policy
          <Arrow />
        </a>
      </section>

      <section className="user-voice-section">
        <div className="section-heading">
          <div className="eyebrow">What people need in the moment</div>
          <h2>The answer is already in your head.</h2>
          <p>
            CueAside is designed around the small gaps that make live
            conversations harder than they need to be.
          </p>
        </div>
        <div className="voice-grid">
          <article>
            <span className="quote-mark">“</span>
            <blockquote>
              I know the answer. I just need the first sentence to get started.
            </blockquote>
            <div className="voice-persona">
              <span>01</span>
              <div>
                <b>Interviewing professional</b>
                <small>Behavioral and technical interviews</small>
              </div>
            </div>
          </article>
          <article>
            <span className="quote-mark">“</span>
            <blockquote>
              I want to use my notes without looking away from the
              conversation.
            </blockquote>
            <div className="voice-persona">
              <span>02</span>
              <div>
                <b>Team contributor</b>
                <small>Planning and stakeholder meetings</small>
              </div>
            </div>
          </article>
          <article>
            <span className="quote-mark">“</span>
            <blockquote>
              Keep the technical terms precise. Make everything around them
              easy to say.
            </blockquote>
            <div className="voice-persona">
              <span>03</span>
              <div>
                <b>Second-language speaker</b>
                <small>High-stakes professional conversations</small>
              </div>
            </div>
          </article>
        </div>
        <p className="illustrative-note">
          Illustrative scenarios based on common live-conversation needs—not
          customer testimonials.
        </p>
      </section>

      <section className="use-cases" id="use-cases">
        <div className="section-heading">
          <div className="eyebrow">Built for high-pressure conversations</div>
          <h2>Use what you prepared when it matters.</h2>
        </div>
        <div className="use-case-grid">
          <article>
            <span className="case-label">INTERVIEWS</span>
            <h3>Answer with your real experience.</h3>
            <p>
              Turn your resume and project stories into a clear opening,
              relevant detail, and a natural example.
            </p>
            <div className="case-prompt">
              <small>QUESTION</small>
              Tell me about a difficult tradeoff you made.
            </div>
          </article>
          <article>
            <span className="case-label">MEETINGS</span>
            <h3>Contribute without losing the thread.</h3>
            <p>
              Pull the right point from your notes and the live discussion
              before the moment passes.
            </p>
            <div className="case-prompt">
              <small>QUESTION</small>
              What should we prioritize before launch?
            </div>
          </article>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="section-heading left-heading">
          <div className="eyebrow">Frequently asked questions</div>
          <h2>What to know before your first session.</h2>
        </div>
        <div className="faq-list">
          <details open>
            <summary>What is CueAside?</summary>
            <p>
              CueAside is a macOS speaking copilot. It listens for questions and
              shows a structured answer you can say naturally during an
              interview, meeting, or professional conversation.
            </p>
          </details>
          <details>
            <summary>Does CueAside join my meeting?</summary>
            <p>
              No. It runs on your Mac and listens through the audio input you
              choose. It does not appear as another participant.
            </p>
          </details>
          <details>
            <summary>Can it use my resume or meeting notes?</summary>
            <p>
              Yes. You decide which brief and supporting notes are available.
              CueAside uses that material to ground the answer without turning
              unsupported details into personal experience.
            </p>
          </details>
          <details>
            <summary>What makes the answer easier to say?</summary>
            <p>
              The first sentence gives you a direct opening. Each blue point
              then adds a white topic sentence with amber key phrases and a
              short explanation, so you can stop or continue naturally.
            </p>
          </details>
          <details>
            <summary>Which languages are supported?</summary>
            <p>
              CueAside currently supports English, Chinese, Spanish, French,
              German, Japanese, Korean, Portuguese, Italian, Hindi, and Arabic.
            </p>
          </details>
          <details>
            <summary>When can I download it?</summary>
            <p>
              The macOS release is in early access. Join the list at the bottom
              of this page and your download link will arrive by email as
              invites roll out.
            </p>
          </details>
        </div>
      </section>

      <section className="closing-cta" id="early-access">
        <img
          src="/cueaside-icon.png"
          alt=""
          width={70}
          height={70}
        />
        <div className="eyebrow">CueAside for macOS</div>
        <h2>Speak clearly before the moment moves on.</h2>
        <p>
          CueAside for macOS is entering early access. Leave your email and the
          download link will reach you first.
        </p>
        <EarlyAccessForm />
      </section>

      <footer>
        <a className="brand footer-brand" href="#">
          <img src="/cueaside-icon.png" alt="" width={28} height={28} />
          <span>CueAside</span>
        </a>
        <p>Prepare once. Speak naturally.</p>
        <div className="footer-meta">
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
          <span>© 2026 CueAside</span>
        </div>
      </footer>
    </main>
  );
}
