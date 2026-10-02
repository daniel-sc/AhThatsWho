import { createSignal } from 'solid-js';
import { liveQuery } from 'dexie';
import { db, backupState, getMeta, setMeta } from '../data/db';
import { BackupCoordinator } from '../backup/coordinator';
import type { BackupProvider, DriveSession } from '../backup/contracts';
import {
  beginDriveConnection,
  disconnectDrive,
  driveProvider,
  driveStatus,
  finishDriveConnection,
} from '../providers/drive';
export const [cloudStatus, setCloudStatus] = createSignal('Not configured');
export const [cloudSignedIn, setCloudSignedIn] = createSignal(false);
export const [provider, setProvider] = createSignal<BackupProvider>();
export const [backupTarget, setBackupTarget] = createSignal<'drive' | 'none'>('none');
export const [googleSession, setGoogleSession] = createSignal<DriveSession>({
  configured: false,
  connected: false,
});
let coordinator: BackupCoordinator | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let backoff = 5000;
let lastCounter = -1;
let connecting: Promise<void> | undefined;
let epoch = 0;
let lastToken = '';
async function target(): Promise<'drive' | 'none'> {
  return (await getMeta('backupTarget', 'none')) === 'drive' ? 'drive' : 'none';
}
async function destination(id: string) {
  await db.transaction('rw', db.meta, async () => {
    const state = await backupState();
    if (state.destination === id) return;
    // Invalidate old upload completions and require an explicit choice at a new destination.
    await setMeta('backup', {
      destination: id,
      counter: state.counter + 1,
      uploadedCounter: 0,
      generation: crypto.randomUUID(),
      authoritative: false,
    });
  });
}
function clearRuntime() {
  epoch++;
  clearTimeout(timer);
  coordinator = undefined;
  setProvider(undefined);
  setCloudSignedIn(false);
}
export async function connectGoogle() {
  clearRuntime();
  await setMeta('backupTarget', 'drive');
  await setMeta('driveConnecting', true);
  await db.meta.delete('driveNeedsCode');
  setBackupTarget('drive');
  setCloudStatus('Connecting Google Drive');
  // Store the Settings return screen before navigation.
  const ui = await getMeta<Record<string, unknown>>('ui', {});
  await setMeta('ui', { ...ui, screen: 'settings' });
  await beginDriveConnection();
}
export async function completeGoogle(code: string) {
  if (!(await finishDriveConnection(code)))
    throw new Error('Connection code was not accepted. Copy it from the Google return page.');
  await db.meta.delete('driveConnecting');
  await initializeCloud();
}
export async function disconnectGoogle() {
  clearRuntime();
  // Stop all local tabs before making the remote disconnect request.
  await setMeta('backupTarget', 'none');
  setBackupTarget('none');
  await disconnectDrive();
  await db.meta.delete('driveConnecting');
  setGoogleSession({ configured: googleSession().configured, connected: false });
  setCloudStatus('Disconnected');
}
export async function initializeCloud() {
  if (connecting) return connecting;
  const mine = epoch;
  connecting = (async () => {
    const selected = await target();
    setBackupTarget(selected);
    if (selected === 'none') return;
    if (selected === 'drive') {
      const completed = await finishDriveConnection();
      if (completed) await db.meta.delete('driveConnecting');
      if (await getMeta('driveConnecting', false)) {
        if (await getMeta('driveFlow', undefined)) {
          setCloudStatus(
            (await getMeta('driveNeedsCode', false))
              ? 'Enter the connection code from the Google return page'
              : 'Return from Google, then refresh connection',
          );
          return;
        }
        await db.meta.delete('driveConnecting');
      }
      const session = await driveStatus();
      if (epoch !== mine || (await target()) !== 'drive') return;
      setGoogleSession(session);
      if (!session.connected) {
        setCloudStatus(
          session.configured ? 'Reconnect Google Drive' : 'Google Drive not configured',
        );
        return;
      }
      const id = `drive:${session.accountId}:${session.installation}`;
      await destination(id);
      const token = await getMeta('driveToken', '');
      const p = driveProvider(
        session.installation!,
        async () =>
          epoch === mine &&
          (await target()) === 'drive' &&
          (await backupState()).destination === id &&
          (await getMeta('driveToken', '')) === token &&
          !(await getMeta('driveConnecting', false)),
      );
      setProvider(p);
      coordinator = new BackupCoordinator(
        p,
        db,
        (s) => {
          if (epoch === mine) setCloudStatus(s);
        },
        id,
      );
      setCloudSignedIn(true);
      const state = await backupState();
      setCloudStatus(
        !state.authoritative
          ? 'Choose restore or back up this notebook'
          : state.counter > state.uploadedCounter
            ? 'Changes waiting for backup'
            : state.lastSuccess
              ? 'Backed up'
              : 'No backup yet',
      );
      schedule();
      return;
    }
  })();
  try {
    await connecting;
  } catch (error) {
    if (epoch === mine) {
      coordinator = undefined;
      if (backupTarget() === 'drive') setGoogleSession({ ...googleSession(), connected: false });
      setProvider(undefined);
      setCloudSignedIn(false);
      setCloudStatus(error instanceof Error ? error.message : 'Cloud connection failed');
    }
    throw error;
  } finally {
    connecting = undefined;
    if (epoch !== mine) queueMicrotask(() => void initializeCloud().catch(() => {}));
  }
}
export async function refreshAuth() {
  await initializeCloud();
}
export async function authorizeBackup() {
  if (!coordinator) throw new Error('Connect backup storage first');
  await coordinator.authorize();
  schedule();
}
export async function retryBackup() {
  if (!coordinator || !cloudSignedIn()) throw new Error('Connect backup storage first');
  const current = coordinator;
  // Tabs share IndexedDB. Only one tab may upload/prune this installation at once.
  try {
    if (navigator.locks) await navigator.locks.request('ahthatswho-backup', () => current.run());
    else await current.run();
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 401) {
      setCloudSignedIn(false);
      setCloudStatus('Reconnect Google Drive to resume backup');
    }
    throw error;
  }
}
function schedule() {
  clearTimeout(timer);
  if (!cloudSignedIn()) return;
  timer = setTimeout(
    () =>
      void retryBackup()
        .then(async () => {
          backoff = 5000;
          const s = await backupState();
          if (s.authoritative && s.counter > s.uploadedCounter) schedule();
        })
        .catch(() => {
          backoff = Math.min(backoff * 2, 300000);
          schedule();
        }),
    backoff,
  );
}
export function startBackup() {
  const subscription = liveQuery(async () => ({
    state: await backupState(),
    selected: await target(),
    pendingConnection: await getMeta('driveConnecting', false),
    token: await getMeta('driveToken', ''),
  })).subscribe(({ state, selected, pendingConnection, token }) => {
    const tokenChanged = lastToken !== token;
    lastToken = token;
    if (selected === 'drive' && tokenChanged && !connecting && !pendingConnection) {
      clearRuntime();
      void initializeCloud().catch(() => {});
      return;
    }
    if (selected !== backupTarget() || pendingConnection) {
      if (coordinator || cloudSignedIn()) clearRuntime();
      setBackupTarget(selected);
      if (pendingConnection) setCloudStatus('Connecting Google Drive');
      else void initializeCloud().catch(() => {});
      return;
    }
    if (state.counter !== lastCounter) {
      lastCounter = state.counter;
      if (cloudSignedIn()) {
        setCloudStatus(
          state.authoritative
            ? 'Changes waiting for backup'
            : 'Choose restore or back up this notebook',
        );
        schedule();
      }
    }
  });
  const resume = () => {
    if (!document.hidden) void refreshAuth().catch(() => {});
  };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  let afterPaint = 0;
  const firstPaint = requestAnimationFrame(() => {
    afterPaint = requestAnimationFrame(() => void initializeCloud().catch(() => {}));
  });
  return () => {
    cancelAnimationFrame(firstPaint);
    cancelAnimationFrame(afterPaint);
    subscription.unsubscribe();
    clearTimeout(timer);
    window.removeEventListener('online', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}
