import Image from "next/image";

const Arrow = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M4 10h11M11 6l4 4-4 4" />
  </svg>
);

const Waveform = () => (
  <div className="waveform" aria-hidden="true">
    <span />
    <span />
    <span />
    <span />
    <span />
    <span />
    <span />
    <span />
    <span />
    <span />
    <span />
  </div>
);

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#" aria-label="CueAside home">
          <Image
            src="/cueaside-icon.png"
            alt=""
            width={34}
            height={34}
            priority
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
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="pulse" />
            AI speaking copilot for macOS
          </div>
          <h1>
            The right words,
            <br />
            <span>right when you need them.</span>
          </h1>
          <p>
            CueAside listens for the question, draws from your own context, and
            gives you a clear opening plus a structured answer—so you can speak
            naturally, not read a script.
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
            <span className="apple-mark" aria-hidden="true">
              ●
            </span>
            Coming soon for macOS
          </div>
        </div>

        <div className="product-stage" aria-label="CueAside product preview">
          <div className="stage-orbit orbit-one" />
          <div className="stage-orbit orbit-two" />
          <div className="app-window">
            <div className="window-bar">
              <div className="traffic-lights" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="session-status">
                <span />
                Interview session
              </div>
              <div className="shortcut">⌘ ⇧ Space</div>
            </div>

            <div className="question-block">
              <div className="question-label">Question detected</div>
              <div className="question">
                Walk me through a pipeline you&apos;re proud of.
              </div>
              <Waveform />
            </div>

            <div className="response-block">
              <div className="response-meta">
                <span>Ready to say</span>
                <span className="mode-pill">Thinking</span>
              </div>
              <div className="opening-cue">
                I built a hybrid batch and streaming pipeline that made Cash
                App reporting reliable.
              </div>
              <div className="answer-steps">
                <div className="answer-step">
                  <span>01</span>
                  <p>
                    <strong>Validate early.</strong> Lambda checked the schema
                    before valid events reached MSK.
                  </p>
                </div>
                <div className="answer-step">
                  <span>02</span>
                  <p>
                    <strong>Keep replay simple.</strong> Both paths landed in
                    partitioned S3 for backfills.
                  </p>
                </div>
                <div className="answer-step">
                  <span>03</span>
                  <p>
                    <strong>Publish trusted data.</strong> Glue and Redshift
                    served reporting-ready marts.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="floating-cue">
            <div className="mini-wave" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <strong>Listening</strong>
              <small>Answer appears when the question ends</small>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Product benefits">
        <div>
          <strong>Fast opening</strong>
          <span>Start speaking without the awkward pause.</span>
        </div>
        <div>
          <strong>Your context</strong>
          <span>Ground every answer in your real experience.</span>
        </div>
        <div>
          <strong>Natural delivery</strong>
          <span>Simple wording, clear structure, easy to say.</span>
        </div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="section-heading">
          <div className="eyebrow">How it works</div>
          <h2>Stay in the conversation.</h2>
          <p>
            CueAside handles the gap between hearing a question and knowing
            exactly how to answer it.
          </p>
        </div>

        <div className="process-grid">
          <article>
            <div className="step-number">01</div>
            <div className="step-icon ear-icon" aria-hidden="true">
              <Waveform />
            </div>
            <h3>Hear the question</h3>
            <p>
              CueAside recognizes when the other person finishes asking and
              prepares the next move.
            </p>
          </article>
          <article>
            <div className="step-number">02</div>
            <div className="step-icon context-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h3>Use what you know</h3>
            <p>
              Your resume, project stories, and meeting notes shape an answer
              that sounds like you.
            </p>
          </article>
          <article>
            <div className="step-number">03</div>
            <div className="step-icon cue-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h3>Speak with a clear path</h3>
            <p>
              Begin with one strong sentence, then follow a concise structure
              with a relevant example.
            </p>
          </article>
        </div>
      </section>

      <section className="answer-section">
        <div className="answer-demo">
          <div className="demo-topline">
            <div>
              <span className="dot" />
              Live answer
            </div>
            <span>Question 4 of 7</span>
          </div>
          <div className="demo-question">
            How do you keep streaming and batch privacy rules consistent?
          </div>
          <div className="demo-opening">
            Config-driven rules keep one privacy policy consistent across both
            paths.
          </div>
          <div className="demo-list">
            <p>
              <b>First, separate policy from code.</b> Glue reads the fields to
              mask or tokenize from configuration.
            </p>
            <p>
              <b>Then, reuse the same rules.</b> Streaming and batch jobs apply
              them before writing clean data.
            </p>
            <p>
              <b>The result is safer change.</b> A policy update is easier to
              review and less likely to create drift.
            </p>
          </div>
        </div>

        <div className="answer-copy">
          <div className="eyebrow">Built to be spoken</div>
          <h2>Not another wall of AI text.</h2>
          <p>
            Every answer starts with the point. The detail follows in a natural
            order, with fewer stacked lists and cleaner transitions.
          </p>
          <ul>
            <li>
              <span>✓</span> Simple words around precise technical terms
            </li>
            <li>
              <span>✓</span> Short thoughts that are easy to say out loud
            </li>
            <li>
              <span>✓</span> Relevant examples from the context you provide
            </li>
          </ul>
        </div>
      </section>

      <section className="use-cases" id="use-cases">
        <div className="section-heading">
          <div className="eyebrow">Where CueAside helps</div>
          <h2>For conversations where wording matters.</h2>
        </div>
        <div className="use-case-grid">
          <article className="featured-card">
            <div className="card-kicker">Interviews</div>
            <h3>Turn your real experience into a strong story.</h3>
            <p>
              Answer technical and behavioral questions with a clear point,
              logical detail, and the right example.
            </p>
            <div className="card-visual interview-visual">
              <span>Tell me about a system you designed.</span>
              <div>
                <b>Start with the outcome.</b>
                <small>Then explain the architecture and tradeoff.</small>
              </div>
            </div>
          </article>
          <article>
            <div className="card-kicker">Meetings</div>
            <h3>Contribute clearly without losing the thread.</h3>
            <p>
              Use the discussion and your notes to frame a concise response,
              update, or follow-up question.
            </p>
            <div className="card-visual meeting-visual">
              <div className="avatar-stack" aria-hidden="true">
                <span>AM</span>
                <span>JL</span>
                <span>YG</span>
              </div>
              <div className="meeting-line">
                <Waveform />
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="privacy-mark" aria-hidden="true">
          <span />
        </div>
        <div>
          <div className="eyebrow">Context on your terms</div>
          <h2>Your experience stays yours.</h2>
          <p>
            You choose the resume, stories, or notes CueAside uses. That context
            makes suggestions more relevant without turning them into generic
            scripts.
          </p>
        </div>
      </section>

      <section className="closing-cta" id="early-access">
        <div className="closing-glow" aria-hidden="true" />
        <Image
          src="/cueaside-icon.png"
          alt=""
          width={70}
          height={70}
        />
        <div className="eyebrow">CueAside for macOS</div>
        <h2>Never get stuck on the first sentence again.</h2>
        <p>
          We&apos;re preparing the first public release. Come back soon for
          early access and launch pricing.
        </p>
        <div className="coming-soon-button">
          Coming soon
          <span>macOS</span>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#">
          <Image src="/cueaside-icon.png" alt="" width={28} height={28} />
          <span>CueAside</span>
        </a>
        <p>Clearer answers. More natural conversations.</p>
        <span>© 2026 CueAside</span>
      </footer>
    </main>
  );
}
