import { createSignal } from 'solid-js';
import { liveQuery } from 'dexie';
import { db, backupState, getMeta } from '../data/db';
import { BackupCoordinator } from '../backup/coordinator';
import type { BackupProvider, CloudConfig } from '../providers/cloudkit';
export const [cloudStatus, setCloudStatus] = createSignal('Not configured');
export const [cloudSignedIn, setCloudSignedIn] = createSignal(false);
export const [provider, setProvider] = createSignal<BackupProvider>();
let coordinator: BackupCoordinator | undefined;
let authenticate: (() => Promise<void>) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let backoff = 5000;
let lastCounter = -1;
let connecting: Promise<void> | undefined;
export async function initializeCloud() {
  if (connecting) return connecting;
  if (authenticate) {
    await authenticate();
    return;
  }
  connecting = (async () => {
    const config = await getMeta<CloudConfig | undefined>('cloudConfig', undefined);
    if (!config?.container || !config.apiToken) return;
    setCloudStatus('Sign-in required');
    const { connectCloud } = await import('../providers/cloudkit');
    const cloud = await connectCloud(config, (signed) => {
      setCloudSignedIn(signed);
      if (signed) schedule();
      else setCloudStatus('Sign-in required');
    });
    setProvider(cloud.provider);
    coordinator = new BackupCoordinator(cloud.provider, db, setCloudStatus);
    authenticate = cloud.auth;
    if (cloudSignedIn()) schedule();
  })();
  try {
    await connecting;
  } catch {
    setCloudStatus('Cloud connection failed');
  } finally {
    connecting = undefined;
  }
}
export async function refreshAuth() {
  if (authenticate) await authenticate();
  else await initializeCloud();
}
export async function authorizeBackup() {
  if (!coordinator) throw new Error('Connect CloudKit first');
  await coordinator.authorize();
  schedule();
}
export async function retryBackup() {
  if (!coordinator || !cloudSignedIn()) throw new Error('Sign in to CloudKit first');
  await coordinator.run();
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
  const subscription = liveQuery(() => backupState()).subscribe((state) => {
    if (state.counter !== lastCounter) {
      lastCounter = state.counter;
      if (cloudSignedIn()) {
        setCloudStatus('Pending');
        schedule();
      }
    }
  });
  const resume = () => {
    if (!document.hidden) {
      void refreshAuth().catch(() => setCloudStatus('Sign-in required'));
      schedule();
    }
  };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  let afterPaint = 0;
  const firstPaint = requestAnimationFrame(() => {
    afterPaint = requestAnimationFrame(() => void initializeCloud());
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
