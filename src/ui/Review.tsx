import { createSignal, createEffect, Show, For, onCleanup } from 'solid-js';
import { db } from '../data/db';
import {
  emptyHousehold,
  uuid,
  captureDrafts,
  captureReceipts,
  personName,
  type Capture,
  type Context,
  type HouseholdRecord,
  type Proposal,
} from '../domain/types';
import {
  applyCapture,
  discardCapture,
  manualProposal,
  saveDraft,
  updateTranscript,
  removals,
} from '../capture/application';
import { validateHousehold } from '../domain/integrity';
import type { GenerationMode } from '../providers/openai-contract';
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
  clearError: () => void;
  editing: (v: boolean) => void;
}) {
  const [editing, setEditing] = createSignal<{
    index: number;
    draft: Proposal;
    expected?: Proposal;
  }>();
  const [sourceText, setSourceText] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal('');
  const [audio, setAudio] = createSignal('');
  let audioUrl = '';
  const c = () => props.capture;
  const drafts = () => captureDrafts(c());
  const receipts = () => captureReceipts(c());
  const completed = () => ['applied', 'discarded'].includes(c().stage);
  const processing = () => busy() || !!c().attempt;
  const source = () => [c().text, c().transcript].filter(Boolean).join('\n');
  const current = (p: Proposal) => props.rows.find((r) => r.household.id === p.targetId);
  const stale = (p: Proposal) =>
    p.action === 'update' &&
    (!current(p) || current(p)?.deletedAt || current(p)?.versionId !== p.baseVersion);
  const ready = () =>
    !processing() &&
    !c().sourceChanged &&
    drafts().length > 0 &&
    drafts().every(
      (p) =>
        (p.action === 'create' || p.action === 'update') &&
        p.household &&
        !stale(p) &&
        !p.contextSuggestions.length,
    );
  createEffect(() => props.editing(!!editing() || sourceText() !== undefined));
  onCleanup(() => {
    props.editing(false);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  });
  async function act(fn: () => Promise<unknown>) {
    if (busy()) return;
    setBusy(true);
    props.clearError();
    try {
      await fn();
    } catch (e) {
      props.error(e);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }
  async function process(mode: GenerationMode = 'auto', index?: number) {
    setStatus(
      mode === 'new'
        ? 'Creating a new household draft from your note…'
        : 'Reading your note and preparing households…',
    );
    const { processCapture } = await import('../capture/process');
    await processCapture(c().id, mode, index);
  }
  function choose(index: number, r?: HouseholdRecord) {
    setEditing({
      index,
      expected: drafts()[index],
      draft: manualProposal(
        r ? structuredClone(r.household) : { ...emptyHousehold(), people: [{ id: uuid() }] },
        r,
      ),
    });
  }
  async function playback() {
    const item = c().audioId && (await db.audio.get(c().audioId!));
    if (!item || !item.chunks.length) throw new Error('Audio is unavailable. Enter source text.');
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(new Blob(item.chunks, { type: item.mime }));
    setAudio(audioUrl);
  }
  function DraftCard(card: { draft?: Proposal; index: number }) {
    const [showTargets, setShowTargets] = createSignal(false);
    const [query, setQuery] = createSignal('');
    const p = () => card.draft;
    const disabled = () => processing() || !!c().sourceChanged;
    return (
      <article class="review-draft" aria-label={`Household ${card.index + 1}`}>
        <Show when={p()}>
          {(draft) => (
            <>
              <p class="eyebrow">
                {draft().action === 'create'
                  ? 'New household'
                  : draft().action === 'update'
                    ? 'Update existing household'
                    : 'Choose an existing household'}
              </p>
              <Show when={draft().household} fallback={<h2>Household {card.index + 1}</h2>}>
                <HouseholdView household={draft().household!} contexts={props.contexts} review />
              </Show>
              <p class="muted review-reason">{draft().reason}</p>
              <Show when={draft().edited}>
                <p class="fine">Edited by you</p>
              </Show>
              <Show when={draft().sourceQuotes?.length}>
                <details class="review-details">
                  <summary>Captured details</summary>
                  <For each={draft().sourceQuotes}>
                    {(quote) => <p class="preserve">{quote}</p>}
                  </For>
                </details>
              </Show>
              <Show when={draft().contextSuggestions.length}>
                <p class="notice">
                  This older proposal suggests new contexts. Create them in Settings if wanted, then
                  reprocess this capture.
                </p>
              </Show>
              <Show when={draft().action === 'multiple'}>
                <p class="notice">
                  This older suggestion needs reprocessing to draft each household.
                </p>
              </Show>
              <Show when={stale(draft())}>
                <p class="notice">
                  This household changed after the proposal was made. Reprocess or manually review
                  the current household.
                </p>
                <Show when={current(draft()) && !current(draft())?.deletedAt}>
                  <button
                    disabled={disabled()}
                    onClick={() => choose(card.index, current(draft()))}
                  >
                    Review using current data
                  </button>
                </Show>
              </Show>
              <Show when={current(draft())}>
                {(target) => (
                  <>
                    <details class="review-details">
                      <summary>Current household</summary>
                      <HouseholdView household={target().household} contexts={props.contexts} />
                    </details>
                    <Show
                      when={
                        draft().household && removals(target().household, draft().household!).length
                      }
                    >
                      <div class="notice">
                        <strong>Changed or removed facts</strong>
                        <ul>
                          <For each={removals(target().household, draft().household!)}>
                            {(change) => <li>{change}</li>}
                          </For>
                        </ul>
                        <p>Saving accepts these changes. The previous version stays in History.</p>
                      </div>
                    </Show>
                  </>
                )}
              </Show>
            </>
          )}
        </Show>
        <Show when={p()?.edited && p()?.action !== 'create'}>
          <p class="fine">
            Drafting as new replaces your manual edits after it succeeds. Source corrections are
            kept.
          </p>
        </Show>
        <div class="actions">
          <Show when={p()?.household && p()?.action !== 'multiple'}>
            <button
              disabled={disabled() || !!stale(p()!) || !!p()?.contextSuggestions.length}
              onClick={() =>
                setEditing({ index: card.index, draft: structuredClone(p()!), expected: p() })
              }
            >
              Edit proposal manually
            </button>
          </Show>
          <Show when={p() && p()?.action !== 'create' && p()?.action !== 'multiple'}>
            <button
              disabled={disabled()}
              onClick={() => void act(() => process('new', card.index))}
            >
              Draft as new household
            </button>
          </Show>
          <button
            class="quiet"
            disabled={disabled()}
            onClick={() => setShowTargets(!showTargets())}
          >
            {showTargets()
              ? 'Cancel household search'
              : p()?.household
                ? 'Choose a different household'
                : 'Update an existing household'}
          </button>
          <Show when={!p() || showTargets()}>
            <button class="quiet" disabled={disabled()} onClick={() => choose(card.index)}>
              Create new manually
            </button>
          </Show>
        </div>
        <Show when={showTargets() || p()?.action === 'ambiguous'}>
          <h3>Choose a household</h3>
          <label>
            Search households
            <input value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />
          </label>
          <p class="fine">Choose a household, then enter the changes from your source note.</p>
          <For
            each={search(props.rows, props.contexts, query()).rows.filter(
              (r) =>
                showTargets() ||
                !p()?.candidateIds.length ||
                p()?.candidateIds.includes(r.household.id),
            )}
            fallback={<p>No matching households. Try another name or draft as new.</p>}
          >
            {(r) => (
              <button
                class="household-row"
                disabled={disabled()}
                onClick={() => choose(card.index, r)}
              >
                <HouseholdView household={r.household} contexts={props.contexts} compact />
              </button>
            )}
          </For>
          <Show when={!showTargets()}>
            <button class="quiet" disabled={disabled()} onClick={() => setShowTargets(true)}>
              Search all households
            </button>
          </Show>
        </Show>
      </article>
    );
  }
  return (
    <Show
      when={editing()}
      keyed
      fallback={
        <section class="capture-review">
          <button class="quiet" onClick={props.back}>
            ← Inbox
          </button>
          <p class="eyebrow">
            {completed() ? 'Capture complete' : 'Nothing changes until you save'}
          </p>
          <h1>
            {receipts().length
              ? `Saved ${receipts().length} ${receipts().length === 1 ? 'household' : 'households'}`
              : completed()
                ? 'Completed capture'
                : 'Review capture'}
          </h1>
          <Show when={receipts().length}>
            <p role="status">Applied to your notebook. No further review needed.</p>
            <For each={receipts()}>
              {(receipt) => {
                const row = () =>
                  props.rows.find((r) => r.household.id === receipt.householdId && !r.deletedAt);
                return (
                  <Show
                    when={row()}
                    fallback={
                      <p>The household is no longer in your notebook. Check Trash to restore it.</p>
                    }
                  >
                    <button
                      class="household-row"
                      onClick={() => props.applied(receipt.householdId)}
                    >
                      {receipts().length === 1
                        ? 'Open household'
                        : `Open ${row()!.household.people.map(personName).join(' & ') || 'household'}`}
                    </button>
                  </Show>
                );
              }}
            </For>
          </Show>
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
            <p class="notice">Recording was interrupted. Check playback before processing.</p>
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
                    class="quiet"
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
              <p class="fine">Process the corrected source before saving household changes.</p>
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
          <Show when={!completed() && sourceText() === undefined}>
            <Show when={c().sourceChanged}>
              <p class="notice">
                Source corrected. Reprocess to refresh these drafts before saving.
              </p>
            </Show>
            <Show when={processing()}>
              <p class="notice" role="status">
                {status() || 'Preparing household drafts…'} Your previous drafts are kept if
                processing fails.
              </p>
            </Show>
            <Show when={drafts().length}>
              <div class="review-heading">
                <h2>
                  {drafts().length}{' '}
                  {drafts().length === 1 ? 'household to review' : 'households to review'}
                </h2>
                <p class="muted">Check who belongs together and where each detail goes.</p>
              </div>
              <For each={drafts()}>
                {(draft, index) => <DraftCard draft={draft} index={index()} />}
              </For>
              <div class="review-save">
                <button
                  class="primary"
                  disabled={!ready()}
                  onClick={() =>
                    void act(async () => {
                      const saved = await applyCapture(c().id, true);
                      if (saved.length === 1) props.applied(saved[0].householdId);
                    })
                  }
                >
                  Save {drafts().length} {drafts().length === 1 ? 'household' : 'households'}
                </button>
                <p class="fine">
                  {ready()
                    ? 'All household changes are saved together.'
                    : 'Resolve each draft and finish processing before saving.'}
                </p>
              </div>
            </Show>
            <details
              class="review-details reprocess-options"
              open={!drafts().length || !!c().sourceChanged}
            >
              <summary>
                {drafts().length ? 'Reprocess or change household grouping' : 'Process this note'}
              </summary>
              <Show when={drafts().some((p) => p.edited)}>
                <p class="notice">
                  Reprocessing replaces your edited drafts after it succeeds. Corrections to the
                  source text are kept.
                </p>
              </Show>
              <div class="actions">
                <button disabled={processing()} onClick={() => void act(() => process())}>
                  {drafts().length ? 'Reprocess' : 'Process with OpenAI'}
                </button>
                <button disabled={processing()} onClick={() => void act(() => process('single'))}>
                  Reprocess as one household
                </button>
                <button disabled={processing()} onClick={() => void act(() => process('multiple'))}>
                  Reprocess as multiple households
                </button>
              </div>
            </details>
            <Show when={!drafts().length && !processing()}>
              <DraftCard index={0} />
            </Show>
            <div class="actions review-footer">
              <button class="quiet" onClick={props.back}>
                Keep for later
              </button>
              <button
                class="quiet danger"
                disabled={processing()}
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
      {(edit) => (
        <Editor
          initial={edit.draft.household!}
          baseVersion={edit.draft.baseVersion}
          contexts={props.contexts}
          draftKey={`draft:proposal:${c().id}:${edit.index}:${edit.draft.targetId || 'new'}:${edit.draft.baseVersion || 'new'}:${edit.expected?.generatedAt || 'manual'}`}
          title="Edit proposal"
          saveLabel="Keep draft changes"
          sourceText={edit.expected?.sourceQuotes?.join('\n') || source()}
          changes={(h) => (current(edit.draft) ? removals(current(edit.draft)!.household, h) : [])}
          error={props.error}
          cancel={() => setEditing(undefined)}
          save={async (h, baseVersion) => {
            validateHousehold(h, new Set(props.contexts.map((x) => x.id)));
            const changed = { ...edit.draft, baseVersion, household: h, model: undefined };
            await saveDraft(c().id, edit.index, changed, edit.expected);
            setEditing(undefined);
          }}
        />
      )}
    </Show>
  );
}
