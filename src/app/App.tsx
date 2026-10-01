import { createSignal, createMemo, Show, For, onMount, onCleanup, lazy, Suspense } from 'solid-js';
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
import { initial, parseRoute, routePath, type Screen, type UI } from './routes';
const Settings = lazy(() => import('../ui/Settings').then((m) => ({ default: m.Settings })));
const CapturePanel = lazy(() =>
  import('../ui/CapturePanel').then((m) => ({ default: m.CapturePanel })),
);
const Review = lazy(() => import('../ui/Review').then((m) => ({ default: m.Review })));
export default function App() {
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
  let historyIndex = 0;
  let restoringHistory = false;
  let revertingHistory = false;
  let navigationEpoch = 0;
  const historyState = (state: UI) => ({ notebook: true, index: historyIndex, ui: state });
  function replaceHistory(state = ui()) {
    window.history.replaceState(historyState(state), '', routePath(state));
  }
  function persist() {
    if (!ready()) return;
    const state = {
      ...ui(),
      scroll: window.scrollY,
      ...(ui().screen === 'home' ? { homeAnchor: anchor() } : {}),
    };
    if (!restoringHistory) replaceHistory(state);
    persistWrites = persistWrites
      .then(() => setMeta('ui', state))
      .then(() => {})
      .catch(report);
  }
  function navigate(screen: Screen, patch: Partial<UI> = {}, scroll = 0) {
    if (!ready() || restoringHistory) return;
    if (recording() || importing()) {
      setNotice(
        recording()
          ? 'Stop the recording before navigating.'
          : 'Finish or cancel the import before navigating.',
      );
      return;
    }
    navigationEpoch++;
    persist();
    if (ui().screen === 'home')
      setUI({ ...ui(), homeScroll: window.scrollY, homeAnchor: anchor() });
    const next = { ...ui(), screen, scroll, ...patch };
    if (routePath(next) !== routePath(ui())) {
      historyIndex++;
      window.history.pushState(historyState(next), '', routePath(next));
    }
    setUI(next);
    setError('');
    setNotice('');
    window.scrollTo(0, scroll);
    persist();
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
  function newHousehold() {
    setEdit({
      h: {
        ...emptyHousehold(),
        contextIds: ui().context ? [ui().context] : [],
        people: [{ id: crypto.randomUUID() }],
      },
    });
    navigate('editor', { target: undefined });
  }
  function beginEdit() {
    if (current()) {
      setEdit({ h: structuredClone(current()!.household), version: current()!.versionId });
      navigate('editor');
    }
  }
  function capture() {
    captureHints = {
      householdId: ui().screen === 'household' ? ui().target : undefined,
      contextId: ui().context || undefined,
    };
    navigate('capture', { previous: ui().screen === 'capture' ? 'home' : ui().screen });
  }
  async function history() {
    try {
      setRevisions(
        await db.revisions
          .where('record.household.id')
          .equals(ui().target!)
          .reverse()
          .sortBy('archivedAt'),
      );
      navigate('history');
    } catch (e) {
      report(e);
    }
  }
  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      report(e);
    }
  }
  async function prepareView(state: UI): Promise<UI> {
    let restored = { ...initial, ...state };
    if (!parseRoute(routePath(restored))) restored = { ...initial };
    if (['household', 'editor', 'history'].includes(restored.screen)) {
      const record = rows().find((r) => r.household.id === restored.target && !r.deletedAt);
      if (record) {
        if (restored.screen === 'editor')
          setEdit({ h: structuredClone(record.household), version: record.versionId });
        if (restored.screen === 'history')
          setRevisions(
            await db.revisions
              .where('record.household.id')
              .equals(record.household.id)
              .reverse()
              .sortBy('archivedAt'),
          );
      } else if (restored.screen === 'editor' && !restored.target) {
        const draft = await getMeta<{ household: Household; baseVersion?: string } | undefined>(
          'draft:household:new',
          undefined,
        );
        setEdit(
          draft
            ? { h: draft.household, version: draft.baseVersion }
            : {
                h: { ...emptyHousehold(), people: [{ id: crypto.randomUUID() }] },
              },
        );
      } else {
        restored = { ...initial };
        setNotice('This household is not available on this device.');
      }
    }
    if (restored.screen === 'review' && !inbox().some((c) => c.id === restored.capture)) {
      restored = { ...initial, screen: 'inbox' };
      setNotice('This capture is not available on this device.');
    }
    if (restored.context && !contexts().some((c) => c.id === restored.context))
      restored = { ...restored, context: '', homeAnchor: undefined };
    if (restored.screen === 'capture')
      captureHints = {
        householdId: restored.previous === 'household' ? restored.target : undefined,
        contextId: restored.context || undefined,
      };
    return restored;
  }
  const popstate = async () => {
    const entry = window.history.state;
    if (revertingHistory && entry?.index === historyIndex) {
      revertingHistory = false;
      restoringHistory = false;
      return;
    }
    if (recording() || importing()) {
      setNotice(
        recording()
          ? 'Stop the recording before navigating.'
          : 'Finish or cancel the import before navigating.',
      );
      if (entry?.notebook && entry.index !== historyIndex) {
        revertingHistory = true;
        restoringHistory = true;
        window.history.go(historyIndex - entry.index);
      }
      return;
    }
    const epoch = ++navigationEpoch;
    restoringHistory = true;
    setError('');
    setNotice('');
    try {
      const route = parseRoute(location.pathname) || { screen: 'home' as const };
      const restored = await prepareView(entry?.notebook ? entry.ui : { ...initial, ...route });
      if (disposed || epoch !== navigationEpoch) return;
      historyIndex = entry?.notebook ? entry.index : 0;
      setUI(restored);
      replaceHistory(restored);
      requestAnimationFrame(() => {
        if (epoch !== navigationEpoch || disposed) return;
        window.scrollTo(0, restored.scroll);
        persist();
      });
    } catch (e) {
      report(e);
      replaceHistory();
    } finally {
      if (epoch === navigationEpoch) restoringHistory = false;
    }
  };
  const previousScrollRestoration = window.history.scrollRestoration;
  window.history.scrollRestoration = 'manual';
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (recording() || importing()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('popstate', popstate);
  onCleanup(() => {
    window.removeEventListener('beforeunload', beforeUnload);
    window.removeEventListener('popstate', popstate);
    window.history.scrollRestoration = previousScrollRestoration;
  });
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
      const route = parseRoute(location.pathname);
      const entry = window.history.state;
      const sameEntry = entry?.notebook && routePath(entry.ui) === routePath(route || initial);
      const restored = await prepareView(
        sameEntry
          ? entry.ui
          : route
            ? { ...initial, ...route }
            : location.pathname === '/' && preferences.resume
              ? saved
              : initial,
      );
      historyIndex = sameEntry ? entry.index : 0;
      if (!route && location.pathname !== '/') setNotice('This page does not exist. Showing Home.');
      setUI(restored);
      setReady(true);
      replaceHistory(restored);
      requestAnimationFrame(() => window.scrollTo(0, restored.scroll || 0));
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
        <button class="brand" onClick={home} aria-label="AhThatsWho home">
          <img class="brand-icon" src="/brand-mark.png" alt="" aria-hidden="true" />
          <span>AhThatsWho</span>
        </button>
        <button class="icon-button" aria-label="Settings" onClick={() => navigate('settings')}>
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
        <Show when={ready()} fallback={<p class="loading">Opening your notebook…</p>}>
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
          disabled={recording() || importing()}
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
          disabled={recording() || importing()}
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
          disabled={recording() || importing()}
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
