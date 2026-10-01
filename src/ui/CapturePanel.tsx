import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { db, getMeta, setMeta, saveCapture } from '../data/db';
import { now, uuid, type Capture } from '../domain/types';
import { getAIMode, getKey } from '../providers/openai';
import { startRecording } from '../capture/recorder';
export function CapturePanel(props: {
  setupAI: () => void;
  hints: Capture['hints'];
  close: () => void;
  review: (id: string) => void;
  error: (e: unknown) => void;
  recording: (v: boolean) => void;
  saved: () => void;
}) {
  const [text, setText] = createSignal('');
  const [recording, setRecording] = createSignal(false);
  const [seconds, setSeconds] = createSignal(0);
  const [saved, setSaved] = createSignal<Capture>();
  const [busy, setBusy] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [status, setStatus] = createSignal('');
  let stop: (() => void) | undefined;
  let processOnStop = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let writes = Promise.resolve();
  let draftId: string = uuid();
  let hints = structuredClone(props.hints);
  onMount(async () => {
    const draft = await getMeta<{ id: string; text: string; hints: Capture['hints'] } | undefined>(
      'draft:capture',
      undefined,
    );
    if (draft) {
      setText(draft.text);
      hints = draft.hints;
      draftId = draft.id;
      setStatus('Recovered local draft');
    }
    setReady(true);
  });
  onCleanup(() => {
    stop?.();
    clearInterval(timer);
    props.recording(false);
  });
  function checkpoint(value: string) {
    setText(value);
    setStatus('Saving draft…');
    writes = writes
      .then(async () => {
        await setMeta('draft:capture', { id: draftId, text: value, hints });
        setStatus('Draft saved on this device');
      })
      .catch((e) => {
        setStatus('Draft could not be saved');
        props.error(e);
      });
  }
  async function record() {
    processOnStop = false;
    setBusy(true);
    try {
      const r = await startRecording(
        hints,
        (c) => {
          setSaved(c);
          setRecording(false);
          props.recording(false);
          clearInterval(timer);
          setBusy(false);
          if (processOnStop && !c.audioMissing && !c.audioIncomplete) void persist(true);
        },
        (e) => {
          props.error(e);
          setBusy(false);
        },
      );
      stop = r.stop;
      setSeconds(0);
      setRecording(true);
      props.recording(true);
      timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      props.error(e);
    } finally {
      setBusy(false);
    }
  }
  async function persist(process: boolean) {
    if (busy()) return;
    setBusy(true);
    try {
      await writes;
      let c = saved();
      if (c) {
        if (text().trim()) {
          c = { ...c, text: text().trim(), updatedAt: now() };
          await saveCapture(c);
        }
      } else {
        if (!text().trim()) throw new Error('Type a note or record audio first.');
        c = {
          id: draftId,
          kind: 'text',
          text: text().trim(),
          hints,
          stage: 'source-ready',
          createdAt: now(),
          updatedAt: now(),
        };
        await saveCapture(c);
      }
      await db.meta.delete('draft:capture');
      if (process) {
        props.review(c.id);
        const { processCapture } = await import('../capture/process');
        void processCapture(c.id).catch(props.error);
      } else props.saved();
    } catch (e) {
      props.error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="capture-panel">
      <h1>A name. A small detail.</h1>
      <p class="muted">
        One note can cover several households. Say who belongs together; review each household
        before saving.
      </p>
      <Show when={getAIMode() === 'personal' && !getKey()}>
        <div class="notice">
          <p>
            Personal AI needs your OpenAI API key. Add one or switch to Sponsored in Settings. You
            can also save your note for later.
          </p>
          <button
            disabled={recording() || busy()}
            onClick={() => void writes.then(props.setupAI).catch(props.error)}
          >
            Set up AI
          </button>
        </div>
      </Show>
      <button
        class={`record-button ${recording() ? 'recording' : ''}`}
        disabled={busy() || !!saved() || !ready()}
        onClick={() => {
          if (recording()) {
            processOnStop = true;
            setBusy(true);
            stop?.();
          } else void record();
        }}
      >
        <span aria-hidden="true">{recording() ? '■' : '●'}</span>{' '}
        {recording() ? `Stop & process · ${seconds()}s` : 'Record a voice note'}
      </button>
      <p class="fine capture-help">
        Stopping sends audio to OpenAI for transcription and a suggestion. Nothing changes until you
        approve it.{' '}
        {getAIMode() === 'sponsored'
          ? 'Sponsored processing passes through our server.'
          : 'Your personal API key pays for processing.'}
      </p>
      <Show when={saved()}>
        <p role="status">
          {saved()?.audioMissing
            ? 'No audio was received. Add text below.'
            : saved()?.audioIncomplete
              ? 'Only received chunks were saved. Recording was interrupted; check playback in Inbox.'
              : 'Audio saved on this device. Choose Save for later or Process now.'}
        </p>
      </Show>
      <label for="capture-text">Write a note</label>
      <textarea
        id="capture-text"
        aria-label="Capture text"
        placeholder="A name, where you met, something to remember…"
        value={text()}
        disabled={!ready()}
        onInput={(e) => checkpoint(e.currentTarget.value)}
        maxLength={20000}
        rows={4}
      />
      <p class="fine" role="status">
        {status()}
      </p>
      <div class="actions">
        <button
          class="primary"
          disabled={busy() || recording() || !ready() || (!text().trim() && !saved())}
          onClick={() => void persist(false)}
        >
          Save for later
        </button>
        <button
          disabled={busy() || recording() || !ready() || (!text().trim() && !saved())}
          onClick={() => void persist(true)}
        >
          Process now
        </button>
      </div>
      <p class="fine capture-help">
        Save for later saves without processing. Process now sends your note and relevant notebook
        details to OpenAI for review. Audio stays local until applied or discarded and is not
        included in backups.
      </p>
      <button
        class="quiet"
        disabled={recording() || busy()}
        onClick={() => void writes.then(props.setupAI).catch(props.error)}
      >
        AI settings
      </button>
      <button class="quiet" disabled={recording()} onClick={props.close}>
        Back · keep draft
      </button>
    </section>
  );
}
