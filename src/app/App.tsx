import { Show, Suspense, onCleanup, type ParentProps } from 'solid-js';
import { Icon } from '../ui/Icon';
import { cloudStatus } from './backup';
import { createNotebook, NotebookContext, useNotebook } from './notebook';
export default function App(props: ParentProps) {
  const notebook = createNotebook();
  return (
    <NotebookContext.Provider value={notebook}>
      <Layout>{props.children}</Layout>
    </NotebookContext.Provider>
  );
}
function Layout(props: ParentProps) {
  const {
    ui,
    setUI,
    ready,
    welcome,
    recording,
    importing,
    online,
    sw,
    blocked,
    unresolved,
    home,
    capture,
    notice,
    setNotice,
    error,
    setError,
  } = useNotebook();
  let searchInput: HTMLInputElement | undefined;
  let cancelSearchScroll = () => {};
  onCleanup(() => cancelSearchScroll());
  function scrollSearchAfterKeyboard(input: HTMLInputElement) {
    cancelSearchScroll();
    const viewport = window.visualViewport;
    const scroll = () => {
      cancelSearchScroll();
      if (input.isConnected && document.activeElement === input)
        input.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resized = () => {
      clearTimeout(timer);
      // iOS can report the new size before its keyboard animation finishes.
      timer = setTimeout(scroll, 350);
    };
    const cancel = () => cancelSearchScroll();
    cancelSearchScroll = () => {
      clearTimeout(timer);
      viewport?.removeEventListener('resize', resized);
      input.removeEventListener('blur', cancel);
      document.removeEventListener('touchmove', cancel);
      document.removeEventListener('wheel', cancel);
      cancelSearchScroll = () => {};
    };
    viewport?.addEventListener('resize', resized);
    input.addEventListener('blur', cancel);
    document.addEventListener('touchmove', cancel, { passive: true });
    document.addEventListener('wheel', cancel, { passive: true });
  }
  return (
    <>
      <header class="app-header" classList={{ welcoming: welcome() }}>
        <button class="brand" disabled={!ready()} onClick={home} aria-label="AhThatsWho home">
          <img class="brand-icon" src="/brand-mark.png" alt="" aria-hidden="true" />
          <span>AhThatsWho</span>
        </button>
        <a
          class="icon-button nav-link"
          href="/settings"
          aria-label="Settings"
          aria-disabled={!ready() || recording() || importing()}
        >
          <Icon name="settings" />
        </a>
        <Show when={ready() && ui().screen === 'home' && !welcome()}>
          <div class="search">
            <Icon name="search" />
            <input
              ref={searchInput}
              type="search"
              aria-label="Search names and details"
              placeholder="Search names and details"
              value={ui().query}
              onFocus={(e) => scrollSearchAfterKeyboard(e.currentTarget)}
              onInput={(e) => {
                setUI({ ...ui(), query: e.currentTarget.value, homeAnchor: undefined });
              }}
            />
            <Show when={ui().query}>
              <button
                type="button"
                class="search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setUI({ ...ui(), query: '', homeAnchor: undefined });
                  searchInput?.focus();
                }}
              >
                <Icon name="close" />
              </button>
            </Show>
          </div>
        </Show>
        <Show when={!welcome()}>
          <span class="backup-label">
            {online() ? `Backup: ${cloudStatus().toLowerCase()}` : 'Offline · saved locally'}
          </span>
        </Show>
      </header>
      <main id="main" data-screen={ui().screen}>
        <Show when={error()}>
          <div id="app-error" class="notice error" role="alert" tabindex="-1">
            {error()}
            <button class="quiet" aria-label="Dismiss error" onClick={() => setError('')}>
              Dismiss
            </button>
          </div>
        </Show>
        <Show when={notice()}>
          <div role="status" class="notice">
            {notice()}
            <button class="quiet" onClick={() => setNotice('')}>
              Dismiss
            </button>
          </div>
        </Show>
        <Show when={sw.needRefresh[0]()}>
          <div class="notice">
            Update available. {blocked() ? 'Finish recording or editing before updating.' : ''}
            <button disabled={blocked()} onClick={() => void sw.updateServiceWorker(true)}>
              Update AhThatsWho
            </button>
          </div>
        </Show>
        <Show when={ready()} fallback={<p class="loading">Opening your notebook…</p>}>
          <Suspense fallback={<p>Opening…</p>}>{props.children}</Suspense>
        </Show>
      </main>
      <nav class="bottom-nav" aria-label="Main navigation">
        <button
          classList={{
            active: ['home', 'household', 'editor', 'history', 'trash'].includes(ui().screen),
          }}
          aria-current={
            ['home', 'household', 'editor', 'history', 'trash'].includes(ui().screen)
              ? 'page'
              : undefined
          }
          disabled={!ready() || recording() || importing()}
          onClick={home}
        >
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
            </svg>
          </span>
          Home
        </button>
        <button
          classList={{ active: ui().screen === 'capture' }}
          aria-current={ui().screen === 'capture' ? 'page' : undefined}
          disabled={!ready() || recording() || importing()}
          onClick={capture}
        >
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </span>
          Capture
        </button>
        <a
          href="/inbox"
          class="nav-link"
          classList={{ active: ui().screen === 'inbox' || ui().screen === 'review' }}
          aria-current={ui().screen === 'inbox' || ui().screen === 'review' ? 'page' : undefined}
          aria-disabled={!ready() || recording() || importing()}
        >
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m3 13 3-9h12l3 9v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
              <path d="M3 13h5l2 3h4l2-3h5" />
            </svg>
            <Show when={unresolved().length}>
              <b>{unresolved().length}</b>
            </Show>
          </span>
          Inbox
        </a>
      </nav>
    </>
  );
}
