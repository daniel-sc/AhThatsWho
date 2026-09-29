import { createSignal, createEffect, Show, For, onCleanup } from 'solid-js';
import { db } from '../data/db';
import {
  emptyHousehold,
  uuid,
  type Capture,
  type Context,
  type HouseholdRecord,
} from '../domain/types';
import {
  applyCapture,
  discardCapture,
  manualProposal,
  saveAndApplyCapture,
  updateTranscript,
  removals,
} from '../capture/application';
import { search } from '../domain/search';
import { HouseholdView } from './HouseholdView';
import { Editor } from './Editor';
export function Review(props: {
  capture: Capture;
  rows: HouseholdRecord[];
  contexts: Context[];
  back: () => void;
  applied: (id: string) => void;
  error: (e: unknown) => void;
  editing: (v: boolean) => void;
}) {
  const [editing, setEditing] = createSignal<ReturnType<typeof manualProposal>>();
  const [targetQuery, setTargetQuery] = createSignal('');
  const [showTargets, setShowTargets] = createSignal(false);
  const [sourceText, setSourceText] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [audio, setAudio] = createSignal('');
  let audioUrl = '';
  const c = () => props.capture;
  const proposal = () => c().proposal;
  const completed = () => ['applied', 'discarded'].includes(c().stage);
  const canReview = () => !completed() && sourceText() === undefined;
  const processing = () => busy() || !!c().attempt;
  const source = () => [c().text, c().transcript].filter(Boolean).join('\n');
  const current = () => props.rows.find((r) => r.household.id === proposal()?.targetId);
  const stale = () =>
    proposal()?.action === 'update' &&
    (!current() || current()?.deletedAt || current()?.versionId !== proposal()?.baseVersion);
  const changes = () =>
    current() && proposal()?.household
      ? removals(current()!.household, proposal()!.household!)
      : [];
  createEffect(() => {
    props.editing(!!editing() || sourceText() !== undefined);
  });
  onCleanup(() => {
    props.editing(false);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  });
  async function act(fn: () => Promise<unknown>) {
    if (busy()) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      props.error(e);
    } finally {
      setBusy(false);
    }
  }
  async function playback() {
    const item = c().audioId && (await db.audio.get(c().audioId!));
    if (!item || !item.chunks.length) throw new Error('Audio is unavailable. Enter source text.');
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(new Blob(item.chunks, { type: item.mime }));
    setAudio(audioUrl);
  }
  const choose = (r?: HouseholdRecord) => {
    setEditing(
      manualProposal(
        r ? structuredClone(r.household) : { ...emptyHousehold(), people: [{ id: uuid() }] },
        r,
      ),
    );
    setShowTargets(false);
  };
  return (
    <Show
      when={editing()}
      keyed
      fallback={
        <section>
          <button class="quiet" onClick={props.back}>
            ← Inbox
          </button>
          <p class="eyebrow">{c().stage.replaceAll('-', ' ')}</p>
          <h1>{completed() ? 'Completed capture' : 'Review capture'}</h1>
          <Show when={c().receipt}>
            <p role="status">Applied to your notebook. No further review needed.</p>
            <Show
              when={props.rows.some(
                (r) => r.household.id === c().receipt!.householdId && !r.deletedAt,
              )}
              fallback={
                <p>The household is no longer in your notebook. Check Trash to restore it.</p>
              }
            >
              <button class="primary" onClick={() => props.applied(c().receipt!.householdId)}>
                Open household
              </button>
            </Show>
          </Show>
          <p class="fine">{new Date(c().createdAt).toLocaleString()}</p>
          <Show when={c().error}>
            <p class="notice" role="alert">
              {c().error}
            </p>
          </Show>
          <Show when={c().audioMissing && !completed()}>
            <p class="notice">
              The original audio is not available on this installation. Enter or correct the text to
              continue.
            </p>
          </Show>
          <Show when={c().audioIncomplete && !completed()}>
            <p class="notice">
              Interrupted recording: received chunks may not play. Nothing beyond received audio is
              claimed saved.
            </p>
          </Show>
          <Show when={c().audioId && !c().audioMissing}>
            <button onClick={() => void act(playback)}>Play saved recording</button>
            <Show when={audio()}>
              <audio controls src={audio()} />
            </Show>
          </Show>
          <h2>Source text</h2>
          <Show
            when={sourceText() !== undefined}
            fallback={
              <>
                <p class="source preserve">{source() || 'Audio awaiting transcription'}</p>
                <Show when={!completed()}>
                  <button
                    disabled={processing()}
                    onClick={() => setSourceText(c().transcript || c().text || '')}
                  >
                    Correct source text
                  </button>
                </Show>
              </>
            }
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await updateTranscript(c().id, sourceText()!);
                  setSourceText(undefined);
                });
              }}
            >
              <label>
                Corrected source text
                <textarea
                  rows={6}
                  maxlength={20000}
                  value={sourceText()}
                  onInput={(e) => setSourceText(e.currentTarget.value)}
                />
              </label>
              <p class="fine">
                Saving replaces the suggestion. Process the corrected text or review it manually.
              </p>
              <div class="actions">
                <button class="primary" disabled={busy() || !sourceText()?.trim()} type="submit">
                  Save source text
                </button>
                <button type="button" disabled={busy()} onClick={() => setSourceText(undefined)}>
                  Cancel correction
                </button>
              </div>
            </form>
          </Show>
          <Show when={proposal() && canReview()}>
            <p>{proposal()?.reason}</p>
            <Show when={proposal()?.action === 'multiple'}>
              <p class="notice">
                This mentions several households. Keep this capture and create separate captures to
                account for each update. No partial application is available.
              </p>
            </Show>
            <Show when={stale()}>
              <p class="notice" role="alert">
                This household changed after the proposal was made. Reprocess or manually review the
                current household.
              </p>
              <Show when={current() && !current()?.deletedAt}>
                <button disabled={processing()} onClick={() => choose(current())}>
                  Review using current data
                </button>
              </Show>
            </Show>
            <Show when={current()}>
              <h2>Current</h2>
              <HouseholdView household={current()!.household} contexts={props.contexts} />
            </Show>
            <Show when={proposal()?.household}>
              <h2>Proposed</h2>
              <HouseholdView
                household={proposal()!.household!}
                contexts={[...props.contexts, ...proposal()!.contextSuggestions]}
              />
              <Show when={changes().length}>
                <div class="notice">
                  <strong>Changed or removed facts</strong>
                  <ul>
                    <For each={changes()}>{(change) => <li>{change}</li>}</For>
                  </ul>
                  <p>Applying accepts these changes. The previous version stays in History.</p>
                </div>
              </Show>
            </Show>
          </Show>
          <Show when={canReview() && (proposal()?.action === 'ambiguous' || showTargets())}>
            <h2>Choose a household</h2>
            <label>
              Search households
              <input value={targetQuery()} onInput={(e) => setTargetQuery(e.currentTarget.value)} />
            </label>
            <p class="fine">Choose a household, then enter the changes from your source note.</p>
            <For
              fallback={<p>No matching households. Try another name or create a new household.</p>}
              each={search(props.rows, props.contexts, targetQuery()).rows.filter(
                (r) =>
                  showTargets() ||
                  !proposal()?.candidateIds.length ||
                  proposal()?.candidateIds.includes(r.household.id),
              )}
            >
              {(r) => (
                <button class="household-row" disabled={processing()} onClick={() => choose(r)}>
                  <HouseholdView household={r.household} contexts={props.contexts} compact />
                </button>
              )}
            </For>
            <Show when={proposal()?.action === 'ambiguous' && !showTargets()}>
              <button onClick={() => setShowTargets(true)}>Search all households</button>
            </Show>
            <button disabled={processing()} onClick={() => choose()}>
              Create new household
            </button>
            <Show when={showTargets()}>
              <button class="quiet" onClick={() => setShowTargets(false)}>
                Cancel household search
              </button>
            </Show>
          </Show>
          <Show when={canReview()}>
            <div class="actions">
              <Show when={proposal()?.household && proposal()?.action !== 'multiple'}>
                <button
                  class="primary"
                  disabled={processing() || !!stale()}
                  onClick={() =>
                    void act(async () => {
                      const receipt = await applyCapture(c().id, true);
                      props.applied(receipt.householdId);
                    })
                  }
                >
                  Apply proposal
                </button>
                <button
                  disabled={processing() || !!stale()}
                  onClick={() => setEditing(structuredClone(proposal()!))}
                >
                  Edit proposal manually
                </button>
              </Show>
              <button
                classList={{ primary: !proposal()?.household }}
                disabled={processing()}
                onClick={() =>
                  void act(async () => {
                    const { processCapture } = await import('../capture/process');
                    await processCapture(c().id);
                  })
                }
              >
                {c().attempt
                  ? 'Processing…'
                  : proposal()
                    ? 'Reprocess'
                    : c().kind === 'audio' && !c().transcript && !c().text
                      ? 'Transcribe & process'
                      : 'Process with OpenAI'}
              </button>
              <Show
                when={
                  !showTargets() && !['multiple', 'ambiguous'].includes(proposal()?.action || '')
                }
              >
                <button disabled={processing()} onClick={() => setShowTargets(true)}>
                  {proposal()?.household
                    ? 'Choose a different household'
                    : 'Update an existing household'}
                </button>
                <button disabled={processing()} onClick={() => choose()}>
                  Create new manually
                </button>
              </Show>
              <button onClick={props.back}>Keep for later</button>
              <button
                class="danger quiet"
                disabled={busy()}
                onClick={() => {
                  if (
                    confirm(
                      'Discard this unapplied source and its local audio? This cannot be undone.',
                    )
                  )
                    void act(async () => {
                      await discardCapture(c().id);
                      props.back();
                    });
                }}
              >
                Discard capture
              </button>
            </div>
          </Show>
        </section>
      }
    >
      {(p) => (
        <Editor
          initial={p.household!}
          baseVersion={p.baseVersion}
          contexts={[...props.contexts, ...p.contextSuggestions]}
          draftKey={`draft:proposal:${c().id}:${p.targetId || 'new'}:${p.baseVersion || 'new'}:${p.model ? p.generatedAt : 'manual'}`}
          title="Edit proposal"
          saveLabel="Save & apply"
          sourceText={source()}
          changes={(h) => {
            const target = props.rows.find((r) => r.household.id === p.targetId);
            return target ? removals(target.household, h) : [];
          }}
          error={props.error}
          cancel={() => setEditing(undefined)}
          save={async (h, baseVersion) => {
            const receipt = await saveAndApplyCapture(c().id, {
              ...p,
              baseVersion,
              household: h,
              model: undefined,
              removals: current() ? removals(current()!.household, h) : [],
            });
            props.applied(receipt.householdId);
          }}
        />
      )}
    </Show>
  );
}
