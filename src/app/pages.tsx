import { createMemo, createResource, onMount, Show, For, lazy } from 'solid-js';
import { Navigate, useParams } from '@solidjs/router';
import { useNotebook } from './notebook';
import { initial, routePath } from './view-state';
import { db, saveHousehold, trashHousehold, restoreRevision } from '../data/db';
import { emptyHousehold } from '../domain/types';
import { Icon } from '../ui/Icon';
import { HouseholdView } from '../ui/HouseholdView';
import { HouseholdList } from '../ui/HouseholdList';
import { ContextFilters } from '../ui/ContextFilters';
import { Editor } from '../ui/Editor';
import { Welcome } from '../ui/Welcome';
const Settings = lazy(() => import('../ui/Settings').then((m) => ({ default: m.Settings })));
const CapturePanel = lazy(() =>
  import('../ui/CapturePanel').then((m) => ({ default: m.CapturePanel })),
);
const Review = lazy(() => import('../ui/Review').then((m) => ({ default: m.Review })));
// Only an actual destination page restores the initial document snapshot.
// Launch/fallback redirects leave it for the page that finally renders.
function usePage() {
  const notebook = useNotebook();
  onMount(notebook.restoreDocumentScroll);
  return notebook;
}
function MissingRecord(props: { href: string; message: string }) {
  const { setNotice } = useNotebook();
  onMount(() => setNotice(props.message));
  return <Navigate href={props.href} />;
}
export function LaunchPage() {
  const { launchState } = useNotebook();
  return <Navigate href={routePath(launchState())} state={{ ui: launchState() }} />;
}
export function NotFoundPage() {
  return <MissingRecord href="/home" message="This page does not exist. Showing Home." />;
}

export function HomePage() {
  const {
    ui,
    setUI,
    contexts,
    welcome,
    installation,
    results,
    navigate,
    openHousehold,
    newHousehold,
    capture,
    homeRestoreAnchor,
  } = usePage();
  const restoreAnchor = homeRestoreAnchor();
  return (
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
            }}
          />
          <Show when={results().fallback}>
            <p class="notice">
              No matches in {contexts().find((c) => c.id === ui().context)?.name}. Showing matches
              from other contexts.{' '}
              <button
                class="quiet"
                onClick={() => {
                  setUI({ ...ui(), context: '', homeAnchor: undefined });
                }}
              >
                Show all contexts
              </button>
            </p>
          </Show>
          <div class="lookup-toolbar">
            <div class="list-heading" role="status" aria-live="polite">
              <span>
                {results().rows.length} {results().rows.length === 1 ? 'household' : 'households'}
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
            restoreAnchor={restoreAnchor}
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
  );
}

export function HouseholdPage() {
  const { ui, contexts, current, navigate, home, beginEdit, capture, history, act } = usePage();
  return (
    <Show
      when={current()}
      fallback={
        <MissingRecord href="/home" message="This household is not available on this device." />
      }
    >
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
          Edited {new Date(current()!.updatedAt).toLocaleString()} · {current()!.source.kind}
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
  );
}

export function EditorPage() {
  const { setRows, contexts, current, ui, navigate, report } = usePage();
  const params = useParams();
  const edit = createMemo(() =>
    current()
      ? { h: structuredClone(current()!.household), version: current()!.versionId }
      : {
          h: {
            ...emptyHousehold(),
            contextIds: ui().context ? [ui().context] : [],
            people: [{ id: crypto.randomUUID() }],
          },
          version: undefined,
        },
  );
  return (
    <Show
      when={!params.target || current()}
      fallback={
        <MissingRecord href="/home" message="This household is not available on this device." />
      }
    >
      <Show when={params.target || 'new'} keyed>
        {(_id) => (
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
            }}
          />
        )}
      </Show>
    </Show>
  );
}

export function HistoryPage() {
  const { current, navigate, act } = usePage();
  const [revisions] = createResource(
    () => current()?.household.id,
    (id) => db.revisions.where('record.household.id').equals(id).reverse().sortBy('archivedAt'),
  );
  return (
    <Show
      when={current()}
      fallback={
        <MissingRecord href="/home" message="This household is not available on this device." />
      }
    >
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
                    confirm('Restore this snapshot? The current version will be kept in history.')
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
        <Show when={!revisions()?.length}>
          <p>No previous versions yet.</p>
        </Show>
      </section>
    </Show>
  );
}

export function TrashPage() {
  const { rows, contexts, navigate, act } = usePage();
  return (
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
              onClick={() => void act(() => trashHousehold(r.household.id, r.versionId, true))}
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
  );
}

export function CapturePage() {
  const { ui, setReturnToCapture, setRecording, setCompleted, report, navigate, setNotice } =
    useNotebook();
  const captureHints = {
    householdId: ui().previous === 'household' ? ui().target : undefined,
    contextId: ui().context || undefined,
  };
  return (
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
  );
}

export function InboxPage() {
  const { inbox, completed, setCompleted, unresolved, navigate, capture } = usePage();
  return (
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
            completed() ? c.stage === 'applied' : !['applied', 'discarded'].includes(c.stage),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
      >
        {(c) => (
          <button class="inbox-row" onClick={() => navigate('review', { capture: c.id })}>
            <span class="eyebrow">
              {c.kind === 'audio' ? 'Voice note' : 'Text note'} ·{' '}
              {new Date(c.createdAt).toLocaleDateString()}
            </span>
            <strong>{(c.transcript || c.text || 'Saved audio recording').slice(0, 160)}</strong>
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
  );
}

export function ReviewPage() {
  const { rows, setRows, contexts, setReviewEditing, report, activeCapture, navigate, act } =
    useNotebook();
  return (
    <Show
      when={activeCapture()}
      fallback={
        <MissingRecord href="/inbox" message="This capture is not available on this device." />
      }
    >
      <Show when={activeCapture()?.id} keyed>
        {(_id) => (
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
        )}
      </Show>
    </Show>
  );
}

export function SettingsPage() {
  const {
    setUI,
    contexts,
    returnToCapture,
    setReturnToCapture,
    setImporting,
    report,
    installation,
    navigate,
    setNotice,
  } = usePage();
  return (
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
        setUI({ ...initial, screen: 'settings' });
        setNotice('Data restored. Local audio is not included in backups.');
      }}
    />
  );
}
