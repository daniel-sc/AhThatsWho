import { createSignal, onMount, Show, For } from 'solid-js';
import { db, getMeta, setMeta, backupState, saveContext, deleteContext, dirty } from '../data/db';
import { snapshot, download, importPreview, replaceData, recoverSafety } from '../backup/portable';
import { uuid, type Backup, type Context, type BackupState } from '../domain/types';
import {
  cloudStatus,
  cloudSignedIn,
  provider,
  initializeCloud,
  refreshAuth,
  authorizeBackup,
  retryBackup,
} from '../app/backup';
import type { CloudConfig, CloudSnapshot } from '../providers/cloudkit';
import { DEFAULT_CLOUD_CONFIG, currentCloudConfig } from '../app/cloud-config';
export function Settings(props: {
  contexts: Context[];
  error: (e: unknown) => void;
  replaced: () => void;
  trash: () => void;
  importing: (v: boolean) => void;
}) {
  const [key, setKeyInput] = createSignal('');
  const [remember, setRemember] = createSignal(false);
  const [keyStatus, setKeyStatus] = createSignal('');
  const [resume, setResume] = createSignal(true);
  const [preview, setPreview] = createSignal<Backup>();
  const [state, setState] = createSignal<BackupState>();
  const [clouds, setClouds] = createSignal<CloudSnapshot[]>([]);
  const [config, setConfig] = createSignal<CloudConfig>({ ...DEFAULT_CLOUD_CONFIG });
  const [busy, setBusy] = createSignal(false);
  const [info, setInfo] = createSignal('');
  const [privateNote, setPrivateNote] = createSignal('');
  onMount(async () => {
    setResume((await getMeta('preferences', { resume: true })).resume);
    setState(await backupState());
    const savedConfig = await getMeta<CloudConfig | undefined>('cloudConfig', undefined);
    setConfig(currentCloudConfig(savedConfig));
    const api = await import('../providers/openai');
    setKeyStatus(api.getKey() ? 'Key available on this device' : 'No key configured');
    if (savedConfig?.container)
      void act(async () => {
        await refreshAuth();
        if (cloudSignedIn()) await listCloud();
      });
  });
  async function act(fn: () => Promise<unknown>) {
    setInfo('');
    setBusy(true);
    try {
      await fn();
      setState(await backupState());
    } catch (e) {
      props.error(e);
    } finally {
      setBusy(false);
    }
  }
  async function listCloud() {
    if (!provider()) throw new Error('Connect CloudKit first');
    setClouds(await provider()!.list());
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
      <p class="eyebrow">YOUR PRIVATE NOTEBOOK</p>
      <h1>Settings</h1>
      <Show when={info()}>
        <p role="status" class="notice">
          {info()}
        </p>
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
                  void act(async () => {
                    await replaceData(b);
                    closePreview();
                    props.replaced();
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
          </div>
        )}
      </Show>
      <fieldset class="settings-content" disabled={!!preview()}>
        <div class="settings-block">
          <h2>OpenAI</h2>
          <p class="muted">
            For transcription and suggested edits. Manual use works without a key.
          </p>
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
                void act(async () => {
                  const api = await import('../providers/openai');
                  api.setKey(key(), remember());
                  setKeyInput('');
                  setKeyStatus(api.getKey() ? 'Key available on this device' : 'No key configured');
                })
              }
            >
              Save key
            </button>
            <button
              onClick={() =>
                void act(async () => {
                  const api = await import('../providers/openai');
                  api.forgetKey();
                  setKeyStatus('No key configured');
                })
              }
            >
              Forget key
            </button>
            <button
              disabled={busy()}
              onClick={() =>
                void act(async () => {
                  const api = await import('../providers/openai');
                  setInfo(await api.checkConnection());
                })
              }
            >
              Check connection & models
            </button>
          </div>
          <details>
            <summary>Verify the parser with synthetic examples</summary>
            <p class="fine">
              Runs three paid requests: a German spelling correction, a birthday without a year, and
              an ambiguous name. No private notebook data is sent by this check.
            </p>
            <button
              disabled={busy()}
              onClick={() =>
                void act(async () => {
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
            Uploads run while NameCue is open. Untranscribed audio remains local only.
          </p>
          <details>
            <summary>CloudKit configuration</summary>
            <label>
              Container ID
              <input
                value={config().container}
                onInput={(e) => setConfig({ ...config(), container: e.currentTarget.value })}
                placeholder="iCloud.com.example.NameCue"
              />
            </label>
            <label>
              Website API token
              <input
                type="password"
                value={config().apiToken}
                onInput={(e) => setConfig({ ...config(), apiToken: e.currentTarget.value })}
              />
            </label>
            <label>
              Environment
              <select
                value={config().environment}
                onChange={(e) =>
                  setConfig({
                    ...config(),
                    environment: e.currentTarget.value as CloudConfig['environment'],
                  })
                }
              >
                <option value="production">Production</option>
                <option value="development">Development</option>
              </select>
            </label>
            <p class="fine">
              CloudKit loads Apple's sign-in script. Scripts on this origin can access a remembered
              OpenAI key. Configuration changes require reopening the app.
            </p>
          </details>
          <button
            disabled={busy()}
            onClick={() =>
              void act(async () => {
                await setMeta('cloudConfig', config());
                await initializeCloud();
                setInfo('Use the Apple sign-in control to connect your private iCloud backups.');
              })
            }
          >
            Connect iCloud
          </button>
          <div id="apple-sign-in" />
          <div id="apple-sign-out" />
          <div class="actions">
            <button onClick={() => void act(refreshAuth)}>Refresh sign-in</button>
            <button disabled={!cloudSignedIn() || busy()} onClick={() => void act(retryBackup)}>
              Retry backup now
            </button>
            <button disabled={!cloudSignedIn() || busy()} onClick={() => void act(listCloud)}>
              List cloud snapshots
            </button>
          </div>
          <Show when={!state()?.authoritative && cloudSignedIn()}>
            <p class="notice">
              Before automatic backup begins, check existing snapshots. Restore one or explicitly
              use your current local notebook.
            </p>
            <button
              onClick={() =>
                void act(async () => {
                  await listCloud();
                  if (
                    confirm(
                      'Use the current local notebook as the authoritative dataset for new backups? Existing snapshots remain subject to the newest-10 retention policy.',
                    )
                  ) {
                    await authorizeBackup();
                    setInfo('Automatic backup enabled for this notebook.');
                  }
                })
              }
            >
              Start fresh / use this notebook
            </button>
          </Show>
          <For each={clouds()}>
            {(s) => (
              <div class="snapshot-row">
                <span>
                  {new Date(s.exportedAt).toLocaleString()}
                  <small>
                    {Math.ceil(s.bytes / 1024)} KB · format {s.version}
                  </small>
                </span>
                <button
                  disabled={busy()}
                  onClick={() =>
                    void act(async () => {
                      const json = await provider()!.load(s.id);
                      review(importPreview(json));
                    })
                  }
                >
                  Restore
                </button>
                <button
                  disabled={busy()}
                  onClick={() => void act(async () => download(await provider()!.load(s.id)))}
                >
                  Download
                </button>
              </div>
            )}
          </For>
        </div>
        <div class="settings-block">
          <h2>Export & recovery</h2>
          <div class="actions">
            <button
              onClick={() =>
                void act(async () => download(JSON.stringify(await snapshot(), null, 2)))
              }
            >
              Export JSON
            </button>
            <label class="file-button">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file)
                    void act(async () => {
                      if (file.size > 50 * 1024 * 1024) throw new Error('File exceeds 50 MB');
                      review(importPreview(await file.text()));
                    });
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <button
              onClick={() => {
                if (
                  confirm(
                    'Recover the previous local dataset? Current data will become the new safety copy.',
                  )
                )
                  void act(async () => {
                    await recoverSafety();
                    props.replaced();
                    setInfo('Previous local data recovered.');
                  });
              }}
            >
              Recover previous local data
            </button>
            <button onClick={props.trash}>Open Trash</button>
            <button
              onClick={() =>
                void act(async () =>
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
          </div>
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
                void act(async () => {
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
                      void act(() => saveContext({ ...c, favorite: e.currentTarget.checked }))
                    }
                  />
                  {c.name}
                </label>
                <button
                  class="quiet"
                  onClick={() => {
                    const name = prompt('Rename context', c.name);
                    if (name?.trim()) void act(() => saveContext({ ...c, name }));
                  }}
                >
                  Rename
                </button>
                <button
                  class="quiet danger"
                  onClick={() =>
                    void act(async () => {
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
              </div>
            )}
          </For>
          <button
            onClick={() => {
              const name = prompt('New context name');
              if (name?.trim()) void act(() => saveContext({ id: uuid(), name, favorite: true }));
            }}
          >
            + Create context
          </button>
        </div>
        <div class="settings-block">
          <h2>On this device</h2>
          <label class="check">
            <input
              type="checkbox"
              checked={resume()}
              onChange={(e) => {
                setResume(e.currentTarget.checked);
                void act(() =>
                  db.transaction('rw', db.meta, async () => {
                    await setMeta('preferences', { resume: resume() });
                    await dirty();
                  }),
                );
              }}
            />
            Resume where I left off
          </label>
          <button
            onClick={() =>
              void act(async () => {
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
          <p class="fine">
            Install on iPhone: Safari → Share → Add to Home Screen. Open once online before offline
            use.
          </p>
        </div>
        <div class="settings-block">
          <h2>About NameCue</h2>
          <p>
            Names, in context. No analytics. Your notebook lives on this device, with optional
            private CloudKit backups.
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
