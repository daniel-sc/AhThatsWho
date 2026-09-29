import { createSignal, onCleanup, Show } from 'solid-js';

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Listen at app startup, not when the welcome/settings disclosure opens.
export function createInstallation(report: (error: unknown) => void) {
  const display = window.matchMedia('(display-mode: standalone)');
  const [installed, setInstalled] = createSignal(
    display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
  );
  const [prompt, setPrompt] = createSignal<InstallEvent>();
  const available = (event: Event) => {
    event.preventDefault();
    setPrompt(event as InstallEvent);
  };
  const complete = () => {
    setInstalled(true);
    setPrompt(undefined);
  };
  const changed = () => {
    if (display.matches) complete();
  };
  window.addEventListener('beforeinstallprompt', available);
  window.addEventListener('appinstalled', complete);
  display.addEventListener('change', changed);
  onCleanup(() => {
    window.removeEventListener('beforeinstallprompt', available);
    window.removeEventListener('appinstalled', complete);
    display.removeEventListener('change', changed);
  });
  async function install() {
    const event = prompt();
    if (!event) return;
    setPrompt(undefined);
    try {
      await event.prompt();
      if ((await event.userChoice).outcome === 'accepted') complete();
    } catch (error) {
      report(error);
    }
  }
  return { installed, available: () => !!prompt(), install };
}

export function InstallHelp(props: { installation: ReturnType<typeof createInstallation> }) {
  const appleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return (
    <Show when={!props.installation.installed()}>
      <details class="install-help">
        <summary>
          Add to Home Screen <span aria-hidden="true">＋</span>
        </summary>
        <p>Keep your notebook one tap away. You can also keep using it in your browser.</p>
        <Show
          when={props.installation.available()}
          fallback={
            <p>
              {appleMobile
                ? 'On iPhone or iPad, open the Share menu, then choose Add to Home Screen. If it is missing, open this page in Safari.'
                : 'Look for Install app in your browser menu or address bar. On Mac Safari, choose File → Add to Dock. If no install option is available, bookmark this page.'}
            </p>
          }
        >
          <button onClick={() => void props.installation.install()}>Install AhThatsWho</button>
        </Show>
        <p class="fine">Open once online before using your notebook offline.</p>
      </details>
    </Show>
  );
}
