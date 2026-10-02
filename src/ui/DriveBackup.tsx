import { liveQuery } from 'dexie';
import { getMeta } from '../data/db';
import { createEffect, createSignal, For, Show, onCleanup } from 'solid-js';
import {
  backupTarget,
  cloudSignedIn,
  connectGoogle,
  completeGoogle,
  disconnectGoogle,
  googleSession,
  refreshAuth,
  authorizeBackup,
  retryBackup,
} from '../app/backup';
import {
  deleteDriveHistory,
  downloadDriveSnapshot,
  downloadDriveImageAsset,
  driveHistories,
  installation,
  renameDrive,
} from '../providers/drive';
import type { DriveHistory } from '../backup/contracts';
import { importPreview } from '../backup/portable';
import type { Backup, BackupState } from '../domain/types';
export function DriveBackup(props: {
  state: BackupState | undefined;
  busy: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  review: (b: Backup) => void;
}) {
  const [histories, setHistories] = createSignal<DriveHistory[]>([]);
  const [label, setLabel] = createSignal('');
  const [code, setCode] = createSignal('');
  const [needsCode, setNeedsCode] = createSignal(false);
  const codeSubscription = liveQuery(() => getMeta('driveNeedsCode', false)).subscribe(
    setNeedsCode,
  );
  onCleanup(() => codeSubscription.unsubscribe());
  const [listed, setListed] = createSignal(false);
  let loaded = '';
  async function restore(snapshotId: string, historyId: string) {
    const notebook = importPreview(await downloadDriveSnapshot(snapshotId));
    const { imageAssetIds, ensureImageAsset } = await import('../data/person-images');
    for (const id of imageAssetIds(notebook)) {
      await ensureImageAsset(id, await downloadDriveImageAsset(historyId, id));
    }
    props.review(notebook);
  }
  async function exportSnapshot(snapshotId: string, historyId: string) {
    const notebook = importPreview(await downloadDriveSnapshot(snapshotId));
    const { createArchive, downloadArchive } = await import('../backup/archive');
    downloadArchive(await createArchive(notebook, (id) => downloadDriveImageAsset(historyId, id)));
  }
  async function list() {
    const value = await driveHistories();
    setHistories(value);
    setListed(true);
  }
  createEffect(() => {
    const s = googleSession(),
      selected = backupTarget();
    const key = selected === 'drive' && s.connected ? `${s.accountId}:${s.installation}` : '';
    if (key !== loaded) {
      loaded = key;
      setHistories([]);
      setListed(false);
      if (key)
        void props.act(async () => {
          setLabel((await installation()).label);
          await list();
        });
    }
  });
  return (
    <div class="drive-backup">
      <h3>Google Drive</h3>
      <p class="fine">
        Each browser or installed app keeps its own notebook and backup history. Connecting the same
        Google account does not sync your notebooks.
      </p>
      <p class="fine">
        Notebook snapshots and cropped portraits pass through our server to your private Google
        Drive app storage. Our server keeps connection credentials, but does not save notebook
        contents. Browse cloud backups here, or export a file for independent recovery.
      </p>
      <Show
        when={backupTarget() === 'drive' && googleSession().connected}
        fallback={
          <p class="fine">Connect an existing Google account. No AhThatsWho signup is needed.</p>
        }
      >
        <p>
          Connected: <strong>{googleSession().email}</strong>
        </p>
      </Show>
      <div class="actions">
        <button disabled={props.busy} onClick={() => void props.act(connectGoogle)}>
          {backupTarget() === 'drive' && googleSession().connected
            ? 'Change Google account'
            : 'Connect Google Drive'}
        </button>
        <Show when={backupTarget() === 'drive'}>
          <button
            disabled={props.busy}
            onClick={() =>
              void props.act(async () => {
                await refreshAuth();
                if (cloudSignedIn()) await list();
              })
            }
          >
            Refresh Google connection
          </button>
          <button disabled={props.busy} onClick={() => void props.act(disconnectGoogle)}>
            Disconnect this installation
          </button>
        </Show>
      </div>
      <Show when={backupTarget() === 'drive' && needsCode()}>
        <p>
          Google opened in a different browser window. Enter the connection code shown on its return
          page to finish in this app.
        </p>
        <label>
          Connection code
          <input
            value={code()}
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            onInput={(e) => setCode(e.currentTarget.value)}
          />
        </label>
        <button
          disabled={props.busy || !code().trim()}
          onClick={() =>
            void props.act(async () => {
              await completeGoogle(code());
              setCode('');
            })
          }
        >
          Finish Google connection
        </button>
      </Show>
      <Show when={backupTarget() === 'drive' && cloudSignedIn()}>
        <label>
          Installation name
          <input maxlength="80" value={label()} onInput={(e) => setLabel(e.currentTarget.value)} />
        </label>
        <button
          disabled={props.busy || !label().trim()}
          onClick={() =>
            void props.act(async () => {
              await renameDrive(label());
              await list();
            })
          }
        >
          Save installation name
        </button>
        <Show when={!props.state?.authoritative}>
          <p class="notice">
            Choose an existing backup below to restore, or start a separate history with this local
            notebook. Nothing uploads until you choose.
          </p>
          <button
            disabled={props.busy || !listed()}
            onClick={() =>
              void props.act(async () => {
                if (
                  confirm(
                    `Back up this local notebook to ${googleSession().email}? Other installations keep their separate histories.`,
                  )
                ) {
                  await authorizeBackup();
                  await retryBackup();
                  await list();
                }
              })
            }
          >
            Back up this notebook here
          </button>
        </Show>
        <div class="actions">
          <button
            disabled={props.busy || !props.state?.authoritative}
            onClick={() =>
              void props.act(async () => {
                await retryBackup();
                await list();
              })
            }
          >
            Back up now
          </button>
          <button disabled={props.busy} onClick={() => void props.act(list)}>
            Refresh backup histories
          </button>
        </div>
        <p class="fine">
          Keeps the latest ten backups plus one per day for 30 days in each history. Older
          installation histories stay until you delete them. Image assets remain in each history for
          recovery.
        </p>
        <Show when={listed() && histories().length === 0}>
          <p>No backup histories found in this account.</p>
        </Show>
        <For each={histories()}>
          {(h) => (
            <details class="backup-history" open={h.id === googleSession().installation}>
              <summary>
                {h.label} {h.id === googleSession().installation ? '· this installation' : ''} ·{' '}
                {h.snapshots.length} backups
              </summary>
              <p class="fine">
                History {h.id.slice(0, 8)} ·{' '}
                {h.snapshots[0]
                  ? new Date(h.snapshots[0].exportedAt).toLocaleString()
                  : 'No snapshot yet'}
              </p>
              <Show when={h.id !== googleSession().installation}>
                <button
                  class="quiet danger"
                  disabled={props.busy}
                  onClick={() =>
                    void props.act(async () => {
                      if (
                        confirm(
                          `Permanently delete all backups in “${h.label}” (${h.id.slice(0, 8)})? This cannot be undone. Local notebooks will not be deleted.`,
                        )
                      ) {
                        await deleteDriveHistory(h.id);
                        await list();
                      }
                    })
                  }
                >
                  Delete this backup history
                </button>
              </Show>
              <For each={h.snapshots}>
                {(s) => (
                  <div class="snapshot-row">
                    <span>
                      {new Date(s.exportedAt).toLocaleString()}
                      <small>
                        {s.households} households · {s.contexts} contexts · {s.captures} captures ·{' '}
                        {Math.ceil(s.bytes / 1024)} KB
                      </small>
                    </span>
                    <button
                      disabled={props.busy}
                      onClick={() => void props.act(async () => restore(s.id, h.id))}
                    >
                      Restore
                    </button>
                    <button
                      disabled={props.busy}
                      onClick={() => void props.act(async () => exportSnapshot(s.id, h.id))}
                    >
                      Download
                    </button>
                  </div>
                )}
              </For>
            </details>
          )}
        </For>
      </Show>
    </div>
  );
}
