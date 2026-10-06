import { ActionFeedback } from './ActionFeedback';
import { DriveBackup } from './DriveBackup';
import { liveQuery } from 'dexie';
import { InstallHelp, type createInstallation } from './InstallHelp';
import { recognitionLanguages, defaultRecognitionLanguages } from '../domain/languages';
import { getAIMode, setAIMode, type AIMode } from '../providers/openai';
import type { Preferences } from '../domain/types';
import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { db, getMeta, setMeta, backupState, saveContext, deleteContext, dirty } from '../data/db';
import { snapshot, replaceData, recoverSafety } from '../backup/portable';
import { uuid, type Backup, type Context, type BackupState } from '../domain/types';
import { cloudStatus, backupTarget, refreshAuth } from '../app/backup';
export function Settings(props: {
  inlinePersonImages: boolean;
  installation: ReturnType<typeof createInstallation>;
  returnToCapture?: () => void;
  contexts: Context[];
  error: (e: unknown) => void;
  replaced: () => void;
  trash: () => void;
  importing: (v: boolean) => void;
}) {
  const [mode, setMode] = createSignal<AIMode>(getAIMode());
  const [key, setKeyInput] = createSignal('');
  const [remember, setRemember] = createSignal(false);
  const [keyStatus, setKeyStatus] = createSignal('');
  const [languages, setLanguages] = createSignal<string[]>(defaultRecognitionLanguages);
  const [resume, setResume] = createSignal(true);
  const [preview, setPreview] = createSignal<Backup>();
  const [state, setState] = createSignal<BackupState>();
  const [busy, setBusy] = createSignal(false);
  const [info, setInfo] = createSignal('');
  const [feedbackOwner, setFeedbackOwner] = createSignal('');
  const [actionError, setActionError] = createSignal('');
  const [privateNote, setPrivateNote] = createSignal('');
  const backupSubscription = liveQuery(() => backupState()).subscribe(setState);
  onCleanup(() => backupSubscription.unsubscribe());
  onMount(async () => {
    const preferences = await getMeta<Preferences>('preferences', { resume: true });
    setResume(preferences.resume);
    setLanguages(preferences.recognitionLanguages ?? defaultRecognitionLanguages);
    setState(await backupState());
    const api = await import('../providers/openai');
    setKeyStatus(api.getKey() ? 'Key available on this device' : 'No key configured');
    if (backupTarget() === 'drive') void act('backup', refreshAuth);
  });
  async function act(owner: string, fn: () => Promise<unknown>) {
    if (busy()) return;
    const trigger = document.activeElement;
    setFeedbackOwner(owner);
    setActionError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
      setState(await backupState());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'This action failed. Try again.');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        if (
          trigger instanceof HTMLElement &&
          trigger.isConnected &&
          document.activeElement === document.body
        )
          trigger.focus({ preventScroll: true });
      });
    }
  }
  function Feedback(part: { owner: string; pending?: string }) {
    return (
      <ActionFeedback
        pending={feedbackOwner() === part.owner && busy() ? part.pending || 'Saving…' : undefined}
        error={feedbackOwner() === part.owner ? actionError() : undefined}
        message={feedbackOwner() === part.owner ? info() : undefined}
      />
    );
  }
  async function savePreferences(changes: Partial<Preferences>) {
    await db.transaction('rw', db.meta, async () => {
      const preferences = await getMeta<Preferences>('preferences', { resume: true });
      await setMeta('preferences', { ...preferences, ...changes });
      await dirty();
    });
  }
  function review(b: Backup) {
    setPreview(b);
    props.importing(true);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.import-preview')?.focus());
  }
  function closePreview() {
    setPreview(undefined);
    props.importing(false);
  }
  return (
    <section>
      <h1>Settings</h1>
      <Show when={props.returnToCapture}>
        <button onClick={props.returnToCapture}>Back to your note</button>
      </Show>
      <Show when={preview()} keyed>
        {(b) => (
          <div class="import-preview" tabindex="-1" role="region" aria-label="Import preview">
            <h2>Replace local data?</h2>
            <p>Snapshot: {new Date(b.exportedAt).toLocaleString()}</p>
            <p>
              {b.households.length} households · {b.revisions.length} revisions · {b.inbox.length}{' '}
              captures · {b.contexts.length} contexts
            </p>
            <p>
              {b.inbox.filter((c) => c.kind === 'audio').length} audio captures have no portable
              audio. Existing credentials stay on this device.
            </p>
            <p>
              A recoverable copy of your current local data will be kept. This snapshot becomes the
              authoritative dataset for future backups.
            </p>
            <div class="actions">
              <button
                class="primary"
                disabled={busy()}
                onClick={() =>
                  void act('import', async () => {
                    await replaceData(b);
                    closePreview();
                    props.replaced();
                    setFeedbackOwner('files');
                    setInfo('Data replaced. Previous local data is recoverable below.');
                  })
                }
              >
                Replace & use this dataset
              </button>
              <button disabled={busy()} onClick={closePreview}>
                Cancel import
              </button>
            </div>
            <Feedback owner="import" pending="Replacing local data…" />
          </div>
        )}
      </Show>
      <fieldset class="settings-content" disabled={!!preview() || busy()}>
        <div class="settings-block">
          <h2>People list</h2>
          <label class="check">
            <input
              type="checkbox"
              checked={props.inlinePersonImages}
              onChange={(event) => {
                const enabled = event.currentTarget.checked;
                void act('people', () => setMeta('inlinePersonImages', enabled));
              }}
            />
            I'll sacrifice quick recognition to satisfy my completeness itch
          </label>
          <p class="fine muted">Show a small picture or placeholder beside every name.</p>
          <Feedback owner="people" />
        </div>
        <div class="settings-block">
          <h2>OpenAI</h2>
          <p class="muted">
            Sponsored transcription and suggested edits need no account or API key. Manual use is
            always available.
          </p>
          <label>
            AI payment
            <select
              value={mode()}
              disabled={busy()}
              onChange={(e) => {
                const next = e.currentTarget.value as AIMode;
                setAIMode(next);
                setMode(next);
                setInfo('');
              }}
            >
              <option value="sponsored">Sponsored — no key needed</option>
              <option value="personal">Personal API key — you pay</option>
            </select>
          </label>
          <p class="fine">
            {mode() === 'sponsored'
              ? 'AI usage is paid for by the app owner, subject to a shared spending limit. Notes, recordings and relevant notebook details pass through our server to OpenAI for processing; our server does not save them.'
              : 'AI requests go directly to OpenAI and are billed to your account. Your key stays on this device.'}{' '}
            If a request fails, your source stays saved. Payment modes never switch automatically.
          </p>
          <fieldset disabled={busy()}>
            <legend>Recognition languages</legend>
            <p class="fine">
              Select all languages you use for recordings and text. Select none for automatic
              detection.
            </p>
            <div class="language-options">
              <For each={recognitionLanguages}>
                {(language) => (
                  <label class="check">
                    <input
                      type="checkbox"
                      checked={languages().includes(language.code)}
                      onChange={(e) => {
                        const next = e.currentTarget.checked
                          ? [...languages(), language.code]
                          : languages().filter((code) => code !== language.code);
                        void act('ai', async () => {
                          await savePreferences({ recognitionLanguages: next });
                          setLanguages(next);
                        });
                      }}
                    />
                    {language.name}
                  </label>
                )}
              </For>
            </div>
          </fieldset>
          <Feedback owner="ai" />
          <Show when={mode() === 'personal'}>
            <p class="fine">{keyStatus()}</p>
            <label>
              API key
              <input
                type="password"
                autocomplete="off"
                value={key()}
                onInput={(e) => setKeyInput(e.currentTarget.value)}
                placeholder="sk-…"
              />
            </label>
            <label class="check">
              <input
                type="checkbox"
                checked={remember()}
                onChange={(e) => setRemember(e.currentTarget.checked)}
              />
              Remember on this device
            </label>
            <p class="fine">
              Otherwise kept in memory until the app closes. Keys never enter exports or backups.
            </p>
            <div class="actions">
              <button
                disabled={busy() || !key().trim()}
                onClick={() =>
                  void act('key', async () => {
                    const api = await import('../providers/openai');
                    api.setKey(key(), remember());
                    setKeyInput('');
                    setKeyStatus(
                      api.getKey() ? 'Key available on this device' : 'No key configured',
                    );
                  })
                }
              >
                Save key
              </button>
              <button
                onClick={() =>
                  void act('key', async () => {
                    const api = await import('../providers/openai');
                    api.forgetKey();
                    setKeyStatus('No key configured');
                  })
                }
              >
                Forget key
              </button>
            </div>
            <Feedback owner="key" />
          </Show>
          <div class="actions">
            <button
              disabled={busy()}
              onClick={() =>
                void act('connection', async () => {
                  const api = await import('../providers/openai');
                  setInfo(await api.checkConnection());
                })
              }
            >
              Check connection & models
            </button>
          </div>
          <Feedback owner="connection" pending="Checking connection and model access…" />
          <details>
            <summary>Verify the parser with synthetic examples</summary>
            <p class="fine">
              Runs three requests using the selected payment mode: a German spelling correction, a
              birthday without a year, and an ambiguous name. No private notebook data is sent by
              this check.
            </p>
            <button
              disabled={busy()}
              onClick={() =>
                void act('evaluation', async () => {
                  const { evaluateParser } = await import('../providers/evaluation');
                  const result = await evaluateParser();
                  await setMeta('parserEvaluation', result);
                  setInfo(
                    `${result.model}: ${result.results.filter((r) => r.passed).length}/3 checks passed. ${result.passed ? 'Synthetic parser evaluation passed.' : 'Review model selection before beta release.'}`,
                  );
                })
              }
            >
              Run parser evaluation · 3 requests
            </button>
            <Feedback owner="evaluation" pending="Checking synthetic examples…" />
          </details>
        </div>
        <div class="settings-block">
          <h2>Automatic backup</h2>
          <p class="status-dot">{cloudStatus()}</p>
          <p class="fine">
            Last verified backup:{' '}
            {state()?.lastSuccess ? new Date(state()!.lastSuccess!).toLocaleString() : 'None yet'}
          </p>
          <p class="fine">
            Uploads run while AhThatsWho is open. Untranscribed audio remains local only.
          </p>
          <DriveBackup
            state={state()}
            busy={busy()}
            act={(fn) => act('drive', fn)}
            review={review}
          />
          <Feedback owner="backup" pending="Checking Google connection…" />
        </div>
        <div class="settings-block">
          <h2>Export & recovery</h2>
          <div class="actions">
            <div class="action-group">
              <button
                disabled={busy()}
                onClick={() =>
                  void act('export', async () => {
                    const { createArchive, downloadArchive } = await import('../backup/archive');
                    downloadArchive(await createArchive(await snapshot()));
                    setInfo('Backup file exported with saved portraits and History.');
                  })
                }
              >
                Export backup ZIP
              </button>
              <Feedback owner="export" pending="Preparing backup ZIP…" />
            </div>
            <div class="action-group">
              <label class="file-button">
                Import backup file
                <input
                  type="file"
                  disabled={busy()}
                  accept="application/zip,application/json,.zip,.json"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file)
                      void act('file-import', async () => {
                        const { readArchive } = await import('../backup/archive');
                        review(await readArchive(file));
                      });
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <Feedback owner="file-import" pending="Reading backup file…" />
            </div>
            <div class="action-group">
              <button
                onClick={() => {
                  if (
                    confirm(
                      'Recover the previous local dataset? Current data will become the new safety copy.',
                    )
                  )
                    void act('recovery', async () => {
                      await recoverSafety();
                      props.replaced();
                      setInfo('Previous local data recovered.');
                    });
                }}
              >
                Recover previous local data
              </button>
              <Feedback owner="recovery" pending="Recovering local data…" />
            </div>
            <button onClick={props.trash}>Open Trash</button>
            <div class="action-group">
              <button
                onClick={() =>
                  void act('empty', async () =>
                    review({
                      ...(await snapshot()),
                      contexts: [],
                      households: [],
                      revisions: [],
                      inbox: [],
                    }),
                  )
                }
              >
                Preview empty notebook
              </button>
              <Feedback owner="empty" pending="Preparing empty notebook preview…" />
            </div>
          </div>
          <Feedback owner="files" pending="Preparing local backup data…" />
          <details>
            <summary>Stage a private note for review</summary>
            <p>
              Paste only the household lines. Each line is retained verbatim as a separate inbox
              capture. Nothing is applied automatically.
            </p>
            <label>
              Private migration source
              <textarea
                rows={6}
                value={privateNote()}
                onInput={(e) => setPrivateNote(e.currentTarget.value)}
              />
            </label>
            <button
              onClick={() =>
                void act('migration', async () => {
                  if (
                    (await db.households.toArray()).some((r) =>
                      r.household.id.startsWith('synthetic-'),
                    )
                  )
                    throw new Error(
                      'Replace the synthetic dataset with an empty snapshot before private migration.',
                    );
                  const { stagePrivateLines } = await import('../capture/migration');
                  const count = await stagePrivateLines(privateNote());
                  setPrivateNote('');
                  setInfo(`${count} source lines staged in Inbox for individual review.`);
                })
              }
            >
              Stage lines in Inbox
            </button>
            <Feedback owner="migration" pending="Staging source lines…" />
          </details>
        </div>
        <div class="settings-block">
          <h2>Contexts</h2>
          <For each={props.contexts}>
            {(c) => (
              <div class="context-setting">
                <label class="check">
                  <input
                    aria-label={`Favorite ${c.name}`}
                    type="checkbox"
                    checked={c.favorite}
                    onChange={(e) =>
                      void act(`context:${c.id}`, () =>
                        saveContext({ ...c, favorite: e.currentTarget.checked }),
                      )
                    }
                  />
                  {c.name}
                </label>
                <button
                  class="quiet"
                  onClick={() => {
                    const name = prompt('Rename context', c.name);
                    if (name?.trim())
                      void act(`context:${c.id}`, () => saveContext({ ...c, name }));
                  }}
                >
                  Rename
                </button>
                <button
                  class="quiet danger"
                  onClick={() =>
                    void act(`context:${c.id}`, async () => {
                      const count = (await db.households.toArray()).filter((r) =>
                        r.household.contextIds.includes(c.id),
                      ).length;
                      if (
                        confirm(
                          `Delete ${c.name} and remove its reference from ${count} households, including Trash? History retains its original label.`,
                        )
                      )
                        await deleteContext(c.id);
                    })
                  }
                >
                  Delete
                </button>
                <Feedback owner={`context:${c.id}`} />
              </div>
            )}
          </For>
          <button
            onClick={() => {
              const name = prompt('New context name');
              if (name?.trim())
                void act('contexts', () => saveContext({ id: uuid(), name, favorite: true }));
            }}
          >
            + Create context
          </button>
          <Feedback owner="contexts" />
        </div>
        <div class="settings-block">
          <h2>On this device</h2>
          <label class="check">
            <input
              type="checkbox"
              checked={resume()}
              onChange={(e) => {
                setResume(e.currentTarget.checked);
                void act('device', () => savePreferences({ resume: resume() }));
              }}
            />
            Resume where I left off
          </label>
          <button
            onClick={() =>
              void act('device', async () => {
                const granted = await navigator.storage?.persist?.();
                setInfo(
                  granted
                    ? 'Persistent browser storage granted. Keep backups enabled.'
                    : 'The browser did not grant persistence. Keep backups enabled.',
                );
              })
            }
          >
            Request persistent storage
          </button>
          <Feedback owner="device" pending="Updating device settings…" />
          <InstallHelp installation={props.installation} />
        </div>
        <div class="settings-block">
          <h2>Feedback</h2>
          <p>
            Something confusing or missing?{' '}
            <a href="mailto:hello@ahthatswho.com?subject=AhThatsWho%20feedback">
              Send feedback by email
            </a>
            .
          </p>
          <p>
            For bug reports and discussion, you can also use{' '}
            <a
              href="https://github.com/daniel-sc/AhThatsWho/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub issues (opens in a new tab)
            </a>
            .
          </p>
        </div>
        <div class="settings-block">
          <h2>About AhThatsWho</h2>
          <p>
            <a href="/privacy">Privacy policy</a>
          </p>
          <p>
            Names, in context. No analytics. Your notebook lives on this device, with optional
            Google Drive backups and portable file recovery.
          </p>
          <p>
            AhThatsWho is open source under the MIT license. Explore the code on{' '}
            <a
              href="https://github.com/daniel-sc/AhThatsWho"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub (opens in a new tab)
            </a>
            .
          </p>
          <p class="fine">
            {__BUILD__.version} · {__BUILD__.sha}
            <br />
            {__BUILD__.time}
          </p>
          <p class="fine">
            Beta verification is pending real iPhone and live-provider checks. This build does not
            claim closed-app uploads or multi-device sync.
          </p>
        </div>
      </fieldset>
    </section>
  );
}
