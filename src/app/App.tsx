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
import { HouseholdView } from '../ui/HouseholdView';
import { HouseholdList } from '../ui/HouseholdList';
import { Editor } from '../ui/Editor';
import { cloudStatus, startBackup } from './backup';
const Settings = lazy(() => import('../ui/Settings').then((m) => ({ default: m.Settings })));
const CapturePanel = lazy(() =>
  import('../ui/CapturePanel').then((m) => ({ default: m.CapturePanel })),
);
const Review = lazy(() => import('../ui/Review').then((m) => ({ default: m.Review })));
type Screen =
  | 'home'
  | 'household'
  | 'editor'
  | 'history'
  | 'trash'
  | 'capture'
  | 'inbox'
  | 'review'
  | 'settings';
type UI = {
  screen: Screen;
  query: string;
  context: string;
  target?: string;
  capture?: string;
  scroll: number;
  homeScroll: number;
  homeAnchor?: { id: string; top: number };
  previous?: Screen;
};
const initial: UI = { screen: 'home', query: '', context: '', scroll: 0, homeScroll: 0 };
export default function App() {
  const [ui, setUI] = createSignal<UI>(initial);
  const [rows, setRows] = createSignal<HouseholdRecord[]>([]);
  const [contexts, setContexts] = createSignal<Context[]>([]);
  const [inbox, setInbox] = createSignal<Capture[]>([]);
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
    if (!ready()) return;
    const state = {
      ...ui(),
      scroll: window.scrollY,
      ...(ui().screen === 'home' ? { homeAnchor: anchor() } : {}),
    };
    persistWrites = persistWrites
      .then(() => setMeta('ui', state))
      .then(() => {})
      .catch(report);
  }
  function navigate(screen: Screen, patch: Partial<UI> = {}, scroll = 0) {
    if (recording() || importing()) {
      setNotice(
        recording()
          ? 'Stop the recording before navigating.'
          : 'Finish or cancel the import before navigating.',
      );
      return;
    }
    if (ui().screen === 'home')
      setUI({ ...ui(), homeScroll: window.scrollY, homeAnchor: anchor() });
    setUI({ ...ui(), screen, scroll, ...patch });
    setError('');
    setNotice('');
    window.scrollTo(0, scroll);
    persist();
  }
  const home = () => {
    if (recording() || importing()) return;
    setUI({ ...initial });
    setError('');
    setNotice('');
    window.scrollTo(0, 0);
    persist();
  };
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
  onMount(async () => {
    try {
      await db.open();
      const [households, ctx, items, preferences, saved] = await Promise.all([
        db.households.toArray(),
        db.contexts.toArray(),
        db.inbox.toArray(),
        getMeta('preferences', { resume: true }),
        getMeta<UI>('ui', initial),
      ]);
      if (disposed) return;
      setRows(households);
      setContexts(ctx);
      setInbox(items);
      let restored = preferences.resume ? saved : initial;
      if (
        ![
          'home',
          'household',
          'editor',
          'history',
          'trash',
          'capture',
          'inbox',
          'review',
          'settings',
        ].includes(restored.screen)
      )
        restored = initial;
      if (['household', 'editor', 'history'].includes(restored.screen)) {
        const r = households.find((r) => r.household.id === restored.target && !r.deletedAt);
        if (r) {
          if (restored.screen === 'editor') setEdit({ h: r.household, version: r.versionId });
          if (restored.screen === 'history') restored = { ...restored, screen: 'household' };
        } else if (restored.screen === 'editor') {
          const draft = await getMeta<{ household: Household; baseVersion?: string } | undefined>(
            'draft:household:new',
            undefined,
          );
          if (draft) setEdit({ h: draft.household, version: draft.baseVersion });
          else restored = { ...restored, screen: 'home' };
        } else restored = { ...restored, screen: 'home' };
      }
      if (restored.screen === 'review' && !items.some((c) => c.id === restored.capture))
        restored = { ...restored, screen: 'inbox' };
      if (restored.context && !ctx.some((c) => c.id === restored.context))
        restored = { ...restored, context: '', homeAnchor: undefined };
      setUI(restored);
      setReady(true);
      requestAnimationFrame(() => window.scrollTo(0, restored.scroll || 0));
      const subscriptions = [
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
      <header class="app-header">
        <button class="brand" onClick={home} aria-label="NameCue home">
          <span class="brand-icon" aria-hidden="true">
            N<span>·</span>
          </span>
          <span>
            NameCue<small>Names, in context.</small>
          </span>
        </button>
        <div class="header-right">
          <span class="backup-label">{online() ? cloudStatus() : 'Offline · saved locally'}</span>
          <button class="icon-button" aria-label="Settings" onClick={() => navigate('settings')}>
            ⚙
          </button>
        </div>
      </header>
      <main id="main">
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
              Update NameCue
            </button>
          </div>
        </Show>
        <Show when={ready()} fallback={<p class="loading">Opening your notebook…</p>}>
          <Suspense fallback={<p>Opening…</p>}>
            <Show when={ui().screen === 'home'}>
              <section>
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">YOUR EVERYDAY PEOPLE</p>
                    <h1>Your people.</h1>
                  </div>
                  <button class="add-button" onClick={newHousehold} aria-label="Add household">
                    +
                  </button>
                </div>
                <label class="search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    aria-label="Search names and details"
                    placeholder="A name, a place, a small detail…"
                    value={ui().query}
                    onInput={(e) => {
                      setUI({ ...ui(), query: e.currentTarget.value, homeAnchor: undefined });
                      persist();
                    }}
                  />
                </label>
                <div class="filters">
                  <button
                    classList={{ selected: !ui().context }}
                    onClick={() => {
                      setUI({ ...ui(), context: '', homeAnchor: undefined });
                      persist();
                    }}
                  >
                    All
                  </button>
                  <For each={contexts().filter((c) => c.favorite || c.id === ui().context)}>
                    {(c) => (
                      <button
                        classList={{ selected: ui().context === c.id }}
                        onClick={() => {
                          setUI({ ...ui(), context: c.id, homeAnchor: undefined });
                          persist();
                        }}
                      >
                        {c.name}
                      </button>
                    )}
                  </For>
                  <Show when={contexts().some((c) => !c.favorite)}>
                    <label class="context-picker">
                      <span class="sr-only">Other contexts</span>
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.currentTarget.value) {
                            setUI({
                              ...ui(),
                              context: e.currentTarget.value,
                              homeAnchor: undefined,
                            });
                            persist();
                          }
                        }}
                      >
                        <option value="">More…</option>
                        <For each={contexts().filter((c) => !c.favorite)}>
                          {(c) => <option value={c.id}>{c.name}</option>}
                        </For>
                      </select>
                    </label>
                  </Show>
                </div>
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
                <div class="list-heading" role="status" aria-live="polite">
                  <span>
                    {results().rows.length}{' '}
                    {results().rows.length === 1 ? 'HOUSEHOLD' : 'HOUSEHOLDS'}
                  </span>
                  <span>Last edited</span>
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
                    <span class="empty-icon" aria-hidden="true">
                      N·
                    </span>
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
                      <button onClick={() => navigate('settings')}>Import or restore</button>
                    </div>
                  </div>
                </Show>
              </section>
            </Show>
            <Show when={ui().screen === 'household' && current()}>
              <section>
                <button class="quiet" onClick={() => navigate('home', {}, ui().homeScroll)}>
                  ← Back to results
                </button>
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">HOUSEHOLD</p>
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
                <p class="eyebrow">CAPTURE NOW, REVIEW WHEN READY</p>
                <h1>Your inbox</h1>
                <div class="filters">
                  <button
                    classList={{ selected: !completed() }}
                    onClick={() => setCompleted(false)}
                  >
                    To review · {unresolved().length}
                  </button>
                  <button classList={{ selected: completed() }} onClick={() => setCompleted(true)}>
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
                        {c.kind === 'audio' ? 'VOICE NOTE' : 'TEXT NOTE'} ·{' '}
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
                contexts={contexts()}
                error={report}
                importing={setImporting}
                trash={() => navigate('trash')}
                replaced={() => {
                  setEdit(undefined);
                  setUI({ ...initial, screen: 'settings' });
                  setNotice('Data restored. Local audio is not included in backups.');
                }}
              />
            </Show>
          </Suspense>
        </Show>
      </main>
      <nav class="bottom-nav" aria-label="Main navigation">
        <button
          classList={{ active: ui().screen === 'home' }}
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
