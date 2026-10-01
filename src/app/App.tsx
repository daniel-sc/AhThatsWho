import {
  createSignal,
  createMemo,
  createEffect,
  on,
  Show,
  For,
  onMount,
  onCleanup,
  lazy,
  Suspense,
} from 'solid-js';
import { useBeforeLeave, useCurrentMatches, useLocation, useNavigate } from '@solidjs/router';
import { liveQuery } from 'dexie';
import { useRegisterSW } from 'virtual:pwa-register/solid';
import {
  db,
  getMeta,
  setMeta,
  saveHousehold,
  trashHousehold,
  restoreRevision,
  recoverInterrupted,
} from '../data/db';
import {
  emptyHousehold,
  type HouseholdRecord,
  type Context,
  type Capture,
  type Revision,
  type Household,
} from '../domain/types';
import { createSearchIndex, searchIndex } from '../domain/search';
import { Icon } from '../ui/Icon';
import { HouseholdView } from '../ui/HouseholdView';
import { HouseholdList } from '../ui/HouseholdList';
import { ContextFilters } from '../ui/ContextFilters';
import { Editor } from '../ui/Editor';
import { cloudStatus, startBackup } from './backup';
import { Welcome } from '../ui/Welcome';
import { createInstallation } from '../ui/InstallHelp';
import { isFreshNotebook } from '../data/onboarding';
import { initial, routePath, routes, decodeId, type Screen, type UI } from './routes';
const Settings = lazy(() => import('../ui/Settings').then((m) => ({ default: m.Settings })));
const CapturePanel = lazy(() =>
  import('../ui/CapturePanel').then((m) => ({ default: m.CapturePanel })),
);
const Review = lazy(() => import('../ui/Review').then((m) => ({ default: m.Review })));
export default function App() {
  const location = useLocation<{ ui: UI }>();
  const go = useNavigate();
  const matches = useCurrentMatches();
  const [opening, setOpening] = createSignal(true);
  // UI snapshots belong to views; Solid Router manages the history entries.
  const viewStates = new Map<string, UI>();
  let launchState = initial;
  const [ui, setUI] = createSignal<UI>(initial);
  const [rows, setRows] = createSignal<HouseholdRecord[]>([]);
  const [contexts, setContexts] = createSignal<Context[]>([]);
  const [inbox, setInbox] = createSignal<Capture[]>([]);
  const [fresh, setFresh] = createSignal(false);
  const [returnToCapture, setReturnToCapture] = createSignal(false);
  const welcome = () =>
    ready() && fresh() && ui().screen === 'home' && !ui().query && !ui().context;
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');
  const [revisions, setRevisions] = createSignal<Revision[]>([]);
  const [edit, setEdit] = createSignal<{ h: Household; version?: string }>();
  const [recording, setRecording] = createSignal(false);
  const [reviewEditing, setReviewEditing] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [completed, setCompleted] = createSignal(false);
  const [online, setOnline] = createSignal(navigator.onLine);
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
  let captureHints: Capture['hints'] = {};
  let disposed = false;
  let persistWrites = Promise.resolve();
  const sw = useRegisterSW();
  const blocked = () =>
    recording() ||
    ui().screen === 'editor' ||
    reviewEditing() ||
    importing() ||
    ui().screen === 'capture';
  const report = (e: unknown) => {
    setError(
      e instanceof Error ? e.message : 'Something went wrong. Your saved data has been kept.',
    );
    requestAnimationFrame(() => document.getElementById('app-error')?.focus());
  };
  const installation = createInstallation(report);
  const current = createMemo(() => rows().find((r) => r.household.id === ui().target));
  const activeCapture = createMemo(() => inbox().find((c) => c.id === ui().capture));
  const index = createMemo(() => createSearchIndex(rows(), contexts()));
  const results = createMemo(() => searchIndex(index(), ui().query, ui().context || undefined));
  const unresolved = createMemo(() =>
    inbox().filter((c) => !['applied', 'discarded'].includes(c.stage)),
  );
  function anchor() {
    const row = [...document.querySelectorAll<HTMLElement>('[data-household]')].find(
      (e) => e.getBoundingClientRect().bottom > 0,
    );
    return row ? { id: row.dataset.household!, top: row.getBoundingClientRect().top } : undefined;
  }
  function persist() {
    if (!ready() || opening()) return;
    const state = {
      ...ui(),
      scroll: window.scrollY,
      ...(ui().screen === 'home' ? { homeAnchor: anchor() } : {}),
    };
    viewStates.set(routePath(state), state);
    persistWrites = persistWrites
      .then(() => setMeta('ui', state))
      .then(() => {})
      .catch(report);
  }
  function canLeave() {
    if (!ready() || opening()) return false;
    if (!recording() && !importing()) return true;
    setNotice(
      recording()
        ? 'Stop the recording before navigating.'
        : 'Finish or cancel the import before navigating.',
    );
    return false;
  }
  useBeforeLeave((event) => {
    if (!canLeave()) event.preventDefault();
    else persist();
  });
  function navigate(screen: Screen, patch: Partial<UI> = {}, scroll = 0) {
    if (!canLeave()) return;
    setNotice('');
    if (ui().screen === 'home')
      setUI({ ...ui(), homeScroll: window.scrollY, homeAnchor: anchor() });
    const next = { ...ui(), screen, scroll, ...patch };
    if (routePath(next) === location.pathname) {
      setUI(next);
      window.scrollTo(0, scroll);
      persist();
    } else {
      viewStates.set(routePath(next), next);
      go(routePath(next), { state: { ui: next }, scroll: false });
    }
  }
  const home = () =>
    navigate('home', {
      ...initial,
      target: undefined,
      capture: undefined,
      previous: undefined,
      homeAnchor: undefined,
    });
  function openHousehold(r: HouseholdRecord) {
    navigate('household', { target: r.household.id });
    void db.households
      .update(r.household.id, { lastViewedAt: new Date().toISOString() })
      .catch(report);
  }
  const newHousehold = () => navigate('editor', { target: undefined });
  const beginEdit = () => navigate('editor');
  function capture() {
    navigate('capture', { previous: ui().screen === 'capture' ? 'home' : ui().screen });
  }
  const history = () => navigate('history');
  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      report(e);
    }
  }
  async function prepareView(state: UI) {
    let restored = { ...initial, ...state };
    let editor: { h: Household; version?: string } | undefined;
    let history: Revision[] = [];
    let message = '';
    if (!routes.some((route) => route.info?.screen === restored.screen)) restored = { ...initial };
    if (['household', 'editor', 'history'].includes(restored.screen)) {
      const record = rows().find((r) => r.household.id === restored.target && !r.deletedAt);
      if (record) {
        if (restored.screen === 'editor')
          editor = { h: structuredClone(record.household), version: record.versionId };
        if (restored.screen === 'history')
          history = await db.revisions
            .where('record.household.id')
            .equals(record.household.id)
            .reverse()
            .sortBy('archivedAt');
      } else if (restored.screen === 'editor' && !restored.target) {
        editor = {
          h: {
            ...emptyHousehold(),
            contextIds: restored.context ? [restored.context] : [],
            people: [{ id: crypto.randomUUID() }],
          },
        };
        // Editor loads its own saved draft after mounting.
      } else {
        restored = { ...initial };
        message = 'This household is not available on this device.';
      }
    }
    if (restored.screen === 'review' && !inbox().some((c) => c.id === restored.capture)) {
      restored = { ...initial, screen: 'inbox' };
      message = 'This capture is not available on this device.';
    }
    if (restored.context && !contexts().some((c) => c.id === restored.context))
      restored = { ...restored, context: '', homeAnchor: undefined };
    return { state: restored, editor, history, message };
  }
  createEffect(
    on(
      () => (ready() ? location.pathname : undefined),
      (path) => {
        if (!path) return;
        const match = matches().at(-1);
        const screen = match?.route.info?.screen as Screen | undefined;
        if (!screen) {
          const state = path === '/' ? launchState : initial;
          viewStates.set(routePath(state), state);
          setOpening(false);
          go(routePath(state), { replace: true, scroll: false });
          if (path !== '/') setNotice('This page does not exist. Showing Home.');
          return;
        }
        const cached = viewStates.get(path) || location.state?.ui || initial;
        const next = {
          ...cached,
          screen,
          ...(['household', 'editor', 'history'].includes(screen)
            ? { target: decodeId(match?.params.target) }
            : {}),
          ...(screen === 'review' ? { capture: decodeId(match?.params.capture) } : {}),
        };
        let cancelled = false;
        onCleanup(() => {
          cancelled = true;
        });
        setOpening(true);
        setError('');
        void prepareView(next)
          .then(({ state, editor, history, message }) => {
            if (cancelled || disposed) return;
            if (routePath(state) !== path.replace(/\/+$/, '')) {
              setOpening(false);
              go(routePath(state), { replace: true, scroll: false });
              setNotice(message);
              return;
            }
            setEdit(editor);
            setRevisions(history);
            captureHints = {
              householdId: state.previous === 'household' ? state.target : undefined,
              contextId: state.context || undefined,
            };
            setUI(state);
            setOpening(false);
            requestAnimationFrame(() => {
              if (cancelled || disposed) return;
              window.scrollTo(0, state.scroll);
              persist();
            });
          })
          .catch((error) => {
            if (!cancelled) {
              setOpening(false);
              report(error);
            }
          });
      },
    ),
  );
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (recording() || importing()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  onCleanup(() => window.removeEventListener('beforeunload', beforeUnload));
  onMount(async () => {
    try {
      await db.open();
      const [households, ctx, items, preferences, saved, newNotebook] = await Promise.all([
        db.households.toArray(),
        db.contexts.toArray(),
        db.inbox.toArray(),
        getMeta('preferences', { resume: true }),
        getMeta<UI>('ui', initial),
        isFreshNotebook(),
      ]);
      if (disposed) return;
      setFresh(newNotebook);
      setRows(households);
      setContexts(ctx);
      setInbox(items);
      launchState = preferences.resume ? saved : initial;
      if (!routes.some((route) => route.info?.screen === launchState.screen)) launchState = initial;
      if (preferences.resume && routePath(saved) === location.pathname)
        viewStates.set(location.pathname, saved);
      setReady(true);
      const subscriptions = [
        liveQuery(() => isFreshNotebook()).subscribe({ next: setFresh, error: report }),
        liveQuery(() => db.households.toArray()).subscribe(setRows),
        liveQuery(() => db.contexts.toArray()).subscribe(setContexts),
        liveQuery(() => db.inbox.toArray()).subscribe(setInbox),
      ];
      const stopBackup = startBackup();
      cleanup = () => {
        subscriptions.forEach((s) => s.unsubscribe());
        stopBackup();
      };
      void recoverInterrupted().catch(report);
    } catch (e) {
      report(e);
    }
  });
  let cleanup = () => {};
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const scroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(persist, 100);
  };
  const lifecycle = () => {
    clearTimeout(scrollTimer);
    persist();
  };
  const network = () => setOnline(navigator.onLine);
  window.addEventListener('scroll', scroll, { passive: true });
  window.addEventListener('pagehide', lifecycle);
  window.addEventListener('online', network);
  window.addEventListener('offline', network);
  onCleanup(() => {
    disposed = true;
    clearTimeout(scrollTimer);
    cleanup();
    window.removeEventListener('scroll', scroll);
    window.removeEventListener('pagehide', lifecycle);
    window.removeEventListener('online', network);
    window.removeEventListener('offline', network);
  });
  return (
    <>
      <header class="app-header" classList={{ welcoming: welcome() }}>
        <button
          class="brand"
          disabled={!ready() || opening()}
          onClick={home}
          aria-label="AhThatsWho home"
        >
          <img class="brand-icon" src="/brand-mark.png" alt="" aria-hidden="true" />
          <span>AhThatsWho</span>
        </button>
        <button
          class="icon-button"
          disabled={!ready() || opening()}
          aria-label="Settings"
          onClick={() => navigate('settings')}
        >
          <Icon name="settings" />
        </button>
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
                persist();
              }}
            />
            <Show when={ui().query}>
              <button
                type="button"
                class="search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setUI({ ...ui(), query: '', homeAnchor: undefined });
                  persist();
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
        <Show when={ready() && !opening()} fallback={<p class="loading">Opening your notebook…</p>}>
          <Suspense fallback={<p>Opening…</p>}>
            <Show when={ui().screen === 'home'}>
              <Show
                when={!welcome()}
                fallback={
                  <Welcome
                    add={newHousehold}
                    capture={capture}
                    restore={() => navigate('settings')}
                    installation={installation}
                  />
                }
              >
                <section>
                  <h1 class="sr-only">Your people.</h1>
                  <div class="search-results">
                    <ContextFilters
                      contexts={contexts()}
                      selected={ui().context}
                      select={(context) => {
                        setUI({ ...ui(), context, homeAnchor: undefined });
                        persist();
                      }}
                    />
                    <Show when={results().fallback}>
                      <p class="notice">
                        No matches in {contexts().find((c) => c.id === ui().context)?.name}. Showing
                        matches from other contexts.{' '}
                        <button
                          class="quiet"
                          onClick={() => {
                            setUI({ ...ui(), context: '', homeAnchor: undefined });
                            persist();
                          }}
                        >
                          Show all contexts
                        </button>
                      </p>
                    </Show>
                    <div class="lookup-toolbar">
                      <div class="list-heading" role="status" aria-live="polite">
                        <span>
                          {results().rows.length}{' '}
                          {results().rows.length === 1 ? 'household' : 'households'}
                        </span>
                        <Show when={results().rows.length}>
                          <span>Last edited</span>
                        </Show>
                      </div>
                      <button class="add-button" onClick={newHousehold} aria-label="Add household">
                        <Icon name="plus" />
                      </button>
                    </div>
                    <HouseholdList
                      rows={results().rows}
                      contexts={contexts()}
                      query={ui().query}
                      restoreAnchor={ui().homeAnchor}
                      open={openHousehold}
                    />
                    <Show when={!results().rows.length}>
                      <div class="empty-state">
                        <img class="empty-icon" src="/brand-mark.png" alt="" aria-hidden="true" />
                        <h2>
                          {ui().query
                            ? 'No familiar names yet?'
                            : ui().context
                              ? 'This context is empty.'
                              : 'A place for the people you know.'}
                        </h2>
                        <p>
                          {ui().query
                            ? 'Try another detail, or capture something new.'
                            : 'Add a household or save a quick note. Your notebook works offline, without an account.'}
                        </p>
                        <div class="actions">
                          <Show when={ui().query}>
                            <button
                              onClick={() => {
                                setUI({ ...ui(), query: '', homeAnchor: undefined });
                                persist();
                              }}
                            >
                              Clear search
                            </button>
                          </Show>
                          <button class="primary" onClick={newHousehold}>
                            Add household
                          </button>
                          <button onClick={capture}>Capture a note</button>
                        </div>
                        <Show when={!ui().query && !ui().context}>
                          <button class="quiet" onClick={() => navigate('settings')}>
                            Import or restore
                          </button>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </section>
              </Show>
            </Show>
            <Show when={ui().screen === 'household' && current()}>
              <section>
                <button class="quiet" onClick={() => navigate('home', {}, ui().homeScroll)}>
                  ← Back to results
                </button>
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">Household</p>
                    <h1>The names, together.</h1>
                  </div>
                  <button onClick={beginEdit}>Edit</button>
                </div>
                <HouseholdView household={current()!.household} contexts={contexts()} />
                <p class="fine">
                  Edited {new Date(current()!.updatedAt).toLocaleString()} ·{' '}
                  {current()!.source.kind}
                </p>
                <div class="actions">
                  <button class="primary" onClick={capture}>
                    Capture an update
                  </button>
                  <button onClick={() => void history()}>History</button>
                  <button
                    class="quiet danger"
                    onClick={() => {
                      if (confirm('Move this household to Trash? You can restore it later.'))
                        void act(async () => {
                          await trashHousehold(current()!.household.id, current()!.versionId);
                          home();
                        });
                    }}
                  >
                    Move to trash
                  </button>
                </div>
              </section>
            </Show>
            <Show when={ui().screen === 'editor' && edit()}>
              <Editor
                initial={edit()!.h}
                baseVersion={edit()!.version}
                contexts={contexts()}
                draftKey={`draft:household:${edit()!.version ? edit()!.h.id : 'new'}`}
                error={report}
                title={edit()?.version ? 'Edit household' : 'Add household'}
                cancel={() => navigate(current() ? 'household' : 'home')}
                save={async (h, baseVersion) => {
                  const r = await saveHousehold(h, baseVersion);
                  setRows(await db.households.toArray());
                  navigate('household', { target: r.household.id });
                  setEdit(undefined);
                }}
              />
            </Show>
            <Show when={ui().screen === 'history'}>
              <section>
                <button class="quiet" onClick={() => navigate('household')}>
                  ← Household
                </button>
                <h1>History</h1>
                <p class="muted">
                  Previous snapshots keep their original source. Restoring creates a new edit.
                </p>
                <For each={revisions()}>
                  {(r) => (
                    <article class="history-card">
                      <p class="eyebrow">
                        {new Date(r.record.updatedAt).toLocaleString()} · {r.record.source.kind}
                      </p>
                      <HouseholdView
                        household={r.record.household}
                        contexts={Object.entries(r.contextNames).map(([id, name]) => ({
                          id,
                          name,
                          favorite: false,
                        }))}
                      />
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              'Restore this snapshot? The current version will be kept in history.',
                            )
                          )
                            void act(async () => {
                              await restoreRevision(r, current()!.versionId);
                              navigate('household');
                            });
                        }}
                      >
                        Restore this version
                      </button>
                    </article>
                  )}
                </For>
                <Show when={!revisions().length}>
                  <p>No previous versions yet.</p>
                </Show>
              </section>
            </Show>
            <Show when={ui().screen === 'trash'}>
              <section>
                <button class="quiet" onClick={() => navigate('settings')}>
                  ← Settings
                </button>
                <h1>Trash</h1>
                <p class="muted">Removed households stay here until you restore them.</p>
                <For each={rows().filter((r) => r.deletedAt)}>
                  {(r) => (
                    <article class="history-card">
                      <HouseholdView household={r.household} contexts={contexts()} compact />
                      <button
                        onClick={() =>
                          void act(() => trashHousehold(r.household.id, r.versionId, true))
                        }
                      >
                        Restore household
                      </button>
                    </article>
                  )}
                </For>
                <Show when={!rows().some((r) => r.deletedAt)}>
                  <p>Trash is empty.</p>
                </Show>
              </section>
            </Show>
            <Show when={ui().screen === 'capture'}>
              <CapturePanel
                setupAI={() => {
                  setReturnToCapture(true);
                  navigate('settings');
                }}
                hints={captureHints}
                close={() => navigate(ui().previous || 'home')}
                saved={() => {
                  setCompleted(false);
                  navigate('inbox');
                  setNotice('Saved to Inbox. Review it whenever you’re ready.');
                }}
                review={(id) => navigate('review', { capture: id })}
                error={report}
                recording={setRecording}
              />
            </Show>
            <Show when={ui().screen === 'inbox'}>
              <section>
                <h1>Your inbox</h1>
                <div class="filters">
                  <button
                    classList={{ selected: !completed() }}
                    aria-pressed={!completed()}
                    onClick={() => setCompleted(false)}
                  >
                    To review · {unresolved().length}
                  </button>
                  <button
                    classList={{ selected: completed() }}
                    aria-pressed={completed()}
                    onClick={() => setCompleted(true)}
                  >
                    Completed
                  </button>
                </div>
                <For
                  each={inbox()
                    .filter((c) =>
                      completed()
                        ? c.stage === 'applied'
                        : !['applied', 'discarded'].includes(c.stage),
                    )
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
                >
                  {(c) => (
                    <button class="inbox-row" onClick={() => navigate('review', { capture: c.id })}>
                      <span class="eyebrow">
                        {c.kind === 'audio' ? 'Voice note' : 'Text note'} ·{' '}
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                      <strong>
                        {(c.transcript || c.text || 'Saved audio recording').slice(0, 160)}
                      </strong>
                      <span class="muted">
                        {c.attempt
                          ? 'Processing…'
                          : c.error
                            ? 'Retry · ' + c.error
                            : c.stage === 'proposed'
                              ? 'Review proposal'
                              : c.stage === 'needs-target'
                                ? 'Choose target'
                                : c.stage === 'missing-source'
                                  ? 'Recover missing source'
                                  : c.stage === 'applied'
                                    ? 'Applied'
                                    : c.kind === 'audio' && !c.transcript
                                      ? 'Transcribe'
                                      : 'Process or review manually'}{' '}
                        →
                      </span>
                    </button>
                  )}
                </For>
                <Show when={completed() && !inbox().some((c) => c.stage === 'applied')}>
                  <div class="empty-state">
                    <h2>No completed captures yet.</h2>
                    <p>Notes you apply to your notebook will appear here.</p>
                  </div>
                </Show>
                <Show when={!unresolved().length && !completed()}>
                  <div class="empty-state">
                    <h2>Nothing waiting on you.</h2>
                    <p>Capture a name or a detail now. It will be here when you have a moment.</p>
                    <button onClick={capture}>Capture a note</button>
                  </div>
                </Show>
              </section>
            </Show>
            <Show when={ui().screen === 'review' && activeCapture()}>
              <Review
                capture={activeCapture()!}
                rows={rows()}
                contexts={contexts()}
                back={() => navigate('inbox')}
                applied={(id) =>
                  void act(async () => {
                    setRows(await db.households.toArray());
                    navigate('household', { target: id });
                  })
                }
                error={report}
                editing={setReviewEditing}
              />
            </Show>
            <Show when={ui().screen === 'settings'}>
              <Settings
                installation={installation}
                returnToCapture={
                  returnToCapture()
                    ? () => {
                        setReturnToCapture(false);
                        navigate('capture');
                      }
                    : undefined
                }
                contexts={contexts()}
                error={report}
                importing={setImporting}
                trash={() => navigate('trash')}
                replaced={() => {
                  setEdit(undefined);
                  setUI({ ...initial, screen: 'settings' });
                  persist();
                  setNotice('Data restored. Local audio is not included in backups.');
                }}
              />
            </Show>
          </Suspense>
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
          disabled={!ready() || opening() || recording() || importing()}
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
          disabled={!ready() || opening() || recording() || importing()}
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
        <button
          classList={{ active: ui().screen === 'inbox' || ui().screen === 'review' }}
          aria-current={ui().screen === 'inbox' || ui().screen === 'review' ? 'page' : undefined}
          disabled={!ready() || opening() || recording() || importing()}
          onClick={() => navigate('inbox')}
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
        </button>
      </nav>
    </>
  );
}
