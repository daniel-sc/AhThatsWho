import { createSignal, createEffect, Show, For, onCleanup } from 'solid-js';
import { db } from '../data/db';
import { emptyHousehold, type Capture, type Context, type HouseholdRecord } from '../domain/types';
import {
  applyCapture,
  discardCapture,
  manualProposal,
  storeProposal,
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
  const [ack, setAck] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [audio, setAudio] = createSignal('');
  let audioUrl = '';
  const c = () => props.capture;
  const proposal = () => c().proposal;
  const current = () => props.rows.find((r) => r.household.id === proposal()?.targetId);
  const stale = () =>
    proposal()?.action === 'update' &&
    (!current() || current()?.deletedAt || current()?.versionId !== proposal()?.baseVersion);
  const changes = () =>
    current() && proposal()?.household
      ? removals(current()!.household, proposal()!.household!)
      : [];
  createEffect(() => {
    props.editing(!!editing());
  });
  onCleanup(() => {
    props.editing(false);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  });
  async function act(fn: () => Promise<unknown>) {
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
    setEditing(manualProposal(r ? structuredClone(r.household) : emptyHousehold(), r));
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
          <h1>Review capture</h1>
          <p class="fine">{new Date(c().createdAt).toLocaleString()}</p>
          <Show when={c().error}>
            <p class="notice" role="alert">
              {c().error}
            </p>
          </Show>
          <Show when={c().audioMissing}>
            <p class="notice">
              The original audio is not available on this installation. Enter or correct the text to
              continue.
            </p>
          </Show>
          <Show when={c().audioIncomplete}>
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
          <h2>Original text / transcript</h2>
          <p class="source preserve">
            {[c().text, c().transcript].filter(Boolean).join('\n') ||
              'Audio awaiting transcription'}
          </p>
          <Show when={!['applied', 'discarded'].includes(c().stage)}>
            <button
              onClick={() => {
                const text = prompt(
                  'Edit transcript or enter missing source text',
                  c().transcript || c().text || '',
                );
                if (text?.trim()) void act(() => updateTranscript(c().id, text));
              }}
            >
              Correct source text
            </button>
          </Show>
          <Show when={proposal()}>
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
              <button onClick={() => choose(current())}>Review using current data</button>
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
                  <label class="check">
                    <input
                      type="checkbox"
                      checked={ack()}
                      onChange={(e) => setAck(e.currentTarget.checked)}
                    />
                    I reviewed these changes and removals
                  </label>
                </div>
              </Show>
            </Show>
          </Show>
          <Show when={proposal()?.action === 'ambiguous' || showTargets()}>
            <h2>Choose a household</h2>
            <label>
              Search households
              <input value={targetQuery()} onInput={(e) => setTargetQuery(e.currentTarget.value)} />
            </label>
            <For
              each={search(props.rows, props.contexts, targetQuery()).rows.filter(
                (r) =>
                  showTargets() ||
                  !proposal()?.candidateIds.length ||
                  proposal()?.candidateIds.includes(r.household.id),
              )}
            >
              {(r) => (
                <button class="household-row" onClick={() => choose(r)}>
                  <HouseholdView household={r.household} contexts={props.contexts} compact />
                </button>
              )}
            </For>
            <button onClick={() => choose()}>Create new household</button>
          </Show>
          <Show when={!['applied', 'discarded'].includes(c().stage)}>
            <div class="actions">
              <Show when={proposal()?.household && proposal()?.action !== 'multiple'}>
                <button
                  class="primary"
                  disabled={busy() || !!stale() || (!!changes().length && !ack())}
                  onClick={() =>
                    void act(async () => {
                      const receipt = await applyCapture(c().id, ack());
                      props.applied(receipt.householdId);
                    })
                  }
                >
                  Apply proposal
                </button>
                <button
                  disabled={!!stale()}
                  onClick={() => setEditing(structuredClone(proposal()!))}
                >
                  Edit proposal manually
                </button>
              </Show>
              <button
                disabled={busy() || !!c().attempt}
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
              <Show when={proposal()?.action !== 'multiple'}>
                <button onClick={() => setShowTargets(true)}>
                  Search households / manual review
                </button>
                <button onClick={() => choose()}>Create new manually</button>
              </Show>
              <button onClick={props.back}>Keep for later</button>
              <button
                class="danger quiet"
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
          draftKey={`draft:proposal:${c().id}`}
          title="Edit proposal"
          error={props.error}
          cancel={() => setEditing(undefined)}
          save={async (h, baseVersion) => {
            await storeProposal(c().id, {
              ...p,
              baseVersion,
              household: h,
              model: undefined,
              removals: current() ? removals(current()!.household, h) : [],
            });
            setEditing(undefined);
            setAck(false);
          }}
        />
      )}
    </Show>
  );
}
