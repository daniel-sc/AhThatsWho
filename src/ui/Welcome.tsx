import { Icon } from './Icon';
import { InstallHelp, type createInstallation } from './InstallHelp';
import './welcome.css';

export function Welcome(props: {
  add: () => void;
  capture: () => void;
  restore: () => void;
  installation: ReturnType<typeof createInstallation>;
}) {
  return (
    <section class="welcome" aria-labelledby="welcome-title">
      <div class="welcome-eyebrow">Sound familiar?</div>
      <h1 id="welcome-title">
        “Leo’s mum.
        <br />
        The red bike.
        <br />
        <em>What’s her name?”</em>
      </h1>
      <p class="welcome-intro">
        Save a small detail today.
        <br />
        Find a familiar name tomorrow.
      </p>
      <div class="welcome-story" role="group" aria-label="Fictional example of finding a name">
        <div class="welcome-query">
          <Icon name="search" />
          <span>red bike</span>
          <small>Example search</small>
        </div>
        <div class="welcome-example">
          <div class="welcome-eyebrow">Example · Fictional people</div>
          <div class="welcome-people">
            <strong>
              Anna <span>Weber</span>
            </strong>
            <b>&amp;</b>
            <strong>
              Sam <span>Becker</span>
            </strong>
          </div>
          <div class="welcome-context">
            School <span>· Parents of Leo</span>
          </div>
          <p>
            Often arrive on a <mark>red cargo bike</mark>
          </p>
        </div>
        <p class="welcome-answer">
          Ah, that’s <strong>Anna.</strong>
        </p>
      </div>
      <div class="welcome-actions">
        <div class="welcome-eyebrow">Start with someone you know</div>
        <button class="welcome-choice welcome-manual" onClick={props.add}>
          <span>
            <strong>Add a person</strong>
            <small>Enter their name and a detail yourself</small>
          </span>
          <span aria-hidden="true">＋</span>
        </button>
        <button class="welcome-choice welcome-ai" onClick={props.capture}>
          <span>
            <strong>Speak or jot a note</strong>
            <small>Let AI turn your words into an entry</small>
          </span>
          <span aria-hidden="true">↗</span>
        </button>
        <p class="welcome-ai-detail">
          <strong>Your notebook is stored on this device.</strong>
          <br />
          Optional AI is sponsored: no login or API key needed. Recordings, notes, and relevant
          notebook details pass through our server to OpenAI for processing. You review suggestions
          before saving. You can also use your own API key in Settings.
        </p>
      </div>
      <div class="welcome-extras">
        <button onClick={props.restore}>
          Import or restore a notebook <span aria-hidden="true">↗</span>
        </button>
        <InstallHelp installation={props.installation} />
        <p>
          <a href="/privacy">Privacy policy</a>
        </p>
      </div>
    </section>
  );
}
