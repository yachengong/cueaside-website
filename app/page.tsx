/* eslint-disable @next/next/no-img-element */

const Arrow = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M4 10h11M11 6l4 4-4 4" />
  </svg>
);

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

function RealOverlay() {
  return (
    <div className="real-overlay" aria-label="CueAside live overlay">
      <div className="overlay-controls">
        <div className="overlay-status-row">
          <span className="live-dot" />
          <div className="overlay-state">
            <div>
              <strong>Answering</strong>
              <span>General · EN · CUE · THINKING · CTX</span>
            </div>
            <small>Generating answer...</small>
          </div>
          <span className="spinner" aria-hidden="true" />
          <div className="overlay-spacer" />
          <span className="timer-pill">00:04</span>
          <button aria-label="Dashboard">⌂</button>
          <button aria-label="End session">◉</button>
        </div>

        <div className="overlay-action-row">
          <span className="style-pill">≡&nbsp;&nbsp;Cue</span>
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
        <div className="question-surface">
          How would you handle a project that&apos;s falling behind?
        </div>
      </div>

      <div className="overlay-panel answer-panel">
        <div className="overlay-panel-title">
          <span>ANSWER</span>
          <span>⌘, / ⌘. scroll</span>
        </div>
        <div className="answer-surface">
          <p>
            <b>
              First, I would separate the critical path from work we can defer.
            </b>
          </p>
          <p>
            Then I&apos;d confirm the blockers with the team and reset the plan
            around the highest-impact deliverables.
          </p>
          <p>
            For example, if one integration is holding the release, I&apos;d
            ship the stable workflow first and move lower-risk work into the
            next milestone.
          </p>
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
  );
}

function RealDashboard() {
  const navItems = [
    ["▦", "Home"],
    ["▤", "Sessions"],
    ["▧", "Context"],
    ["≋", "Audio"],
    ["▯", "Phone"],
    ["⚙", "Settings"],
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
          General · Cue
        </div>
        <button className="start-session">▶&nbsp;&nbsp;Start Session</button>
      </aside>

      <div className="dash-content">
        <div className="dash-heading">
          <h3>Overview</h3>
          <p>Start a session to open the private overlay.</p>
        </div>
        <div className="dash-card session-card">
          <span className="idle-indicator">
            <i />
          </span>
          <div>
            <strong>No active session</strong>
            <p>The overlay opens in focus mode when you start.</p>
          </div>
          <span className="sleep-mark">☾</span>
        </div>
        <div className="dash-chips">
          <div>
            <small>ROLE</small>
            <b>General</b>
          </div>
          <div>
            <small>STYLE</small>
            <b>Cue</b>
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
        <small className="chip-hint">Click a chip to cycle its value.</small>
        <div className="recent-heading">
          <b>Recent sessions</b>
          <span>View all</span>
        </div>
        <div className="dash-card recent-card">
          <div>
            <span className="file-icon">▤</span>
            <p>
              <b>Product interview</b>
              <small>Today · 7 questions</small>
            </p>
          </div>
          <span>›</span>
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
          <a href="#use-cases">Use cases</a>
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
            Native speaking copilot for macOS
          </div>
          <h1>
            Stay present.
            <br />
            <span>Find the words.</span>
          </h1>
          <p>
            CueAside listens for the question and puts a speaking-ready answer
            in a private overlay—grounded in the resume, notes, and context you
            choose.
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
            Coming soon for macOS
          </div>
        </div>

        <div className="product-stage">
          <div className="stage-label">
            <span />
            Actual CueAside overlay
          </div>
          <RealOverlay />
        </div>
      </section>

      <section className="trust-row" aria-label="Product attributes">
        <span>Native macOS app</span>
        <i />
        <span>No meeting bot</span>
        <i />
        <span>Context-aware answers</span>
        <i />
        <span>Interview and meeting modes</span>
      </section>

      <section className="product-truth">
        <div className="section-heading left-heading">
          <div className="eyebrow">The actual product</div>
          <h2>Prepare in the dashboard. Speak from the overlay.</h2>
          <p>
            CueAside has two clear states. Set your role, language, answer
            style, and context before the call. During the conversation, only
            the focused question-and-answer window stays in front of you.
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

      <section className="difference-section">
        <div className="difference-copy">
          <div className="eyebrow">Why CueAside</div>
          <h2>Help for speaking—not another chat window.</h2>
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
              <h3>Cue or Read, depending on the moment</h3>
              <p>
                Use compact guidance when you know the story, or more complete
                wording when language is the harder part.
              </p>
            </div>
          </article>
        </div>
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

      <section className="closing-cta" id="early-access">
        <img
          src="/cueaside-icon.png"
          alt=""
          width={70}
          height={70}
        />
        <div className="eyebrow">CueAside for macOS</div>
        <h2>Keep your attention on the person—not the prompt.</h2>
        <p>
          The first public release is in progress. Join early access when
          CueAside opens.
        </p>
        <div className="coming-soon-button">
          Coming soon
          <span>macOS</span>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#">
          <img src="/cueaside-icon.png" alt="" width={28} height={28} />
          <span>CueAside</span>
        </a>
        <p>Prepare once. Speak naturally.</p>
        <span>© 2026 CueAside</span>
      </footer>
    </main>
  );
}
