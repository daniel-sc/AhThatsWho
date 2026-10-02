import { db, getMeta, setMeta } from '../data/db';
import type { BackupProvider, DriveHistory, DriveSession } from '../backup/contracts';
import { BACKUP_IMAGE_MAX_BYTES } from '../backup/contracts';
import { validateImageAsset } from '../data/person-images';
interface Installation {
  id: string;
  device: string;
  label: string;
}
interface Flow {
  state: string;
  claim: string;
  created: number;
}
export class DriveClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function installation(): Promise<Installation> {
  return db.transaction('rw', db.meta, async () => {
    let value = await getMeta<Installation | undefined>('driveInstallation', undefined);
    if (!value) {
      const standalone = window.matchMedia('(display-mode: standalone)').matches;
      const platform = /iPhone/.test(navigator.userAgent)
        ? 'iPhone'
        : /iPad/.test(navigator.userAgent)
          ? 'iPad'
          : /Mac/.test(navigator.userAgent)
            ? 'Mac'
            : 'Computer';
      value = {
        id: crypto.randomUUID(),
        device: crypto.randomUUID() + crypto.randomUUID(),
        label: `${platform} · ${standalone ? 'App' : 'Browser'}`,
      };
      await setMeta('driveInstallation', value);
    }
    return value;
  });
}
export async function driveRequest<T>(
  path: string,
  body?: unknown,
  method = 'POST',
  guard?: () => Promise<void>,
): Promise<T> {
  const local = await installation();
  const token = await getMeta<string>('driveToken', '');
  await guard?.();
  const response = await fetch(`/api/backup/${path}`, {
    method,
    headers: {
      'X-AhThatsWho': 'backup',
      'X-Backup-Device': local.device,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok)
    throw new DriveClientError(data.error || 'Google Drive request failed.', response.status);
  return data;
}
export const driveStatus = () => driveRequest<DriveSession>('status', undefined, 'GET');
export const driveHistories = () => driveRequest<DriveHistory[]>('histories');
export async function beginDriveConnection() {
  const local = await installation();
  const flow = await driveRequest<{ state: string; claim: string; url: string }>('connect', {
    installation: local.id,
    device: local.device,
  });
  await setMeta('driveFlow', { state: flow.state, claim: flow.claim, created: Date.now() });
  // Our authorization endpoint sets the OAuth browser cookie before leaving for Google.
  window.location.assign(flow.url);
}
export async function finishDriveConnection(completion?: string) {
  if (navigator.locks)
    return navigator.locks.request('ahthatswho-google-connect', () => finishConnection(completion));
  return finishConnection(completion);
}
async function finishConnection(completion?: string) {
  const flow = await getMeta<Flow | undefined>('driveFlow', undefined);
  if (!flow) return false;
  if (Date.now() - flow.created > 10 * 60000) {
    await db.meta.delete('driveFlow');
    throw new Error('Google connection expired. Connect again.');
  }
  const local = await installation();
  const result = await driveRequest<{ pending?: boolean; needsCode?: boolean; token?: string }>(
    'finish',
    {
      state: flow.state,
      claim: flow.claim,
      device: local.device,
      completion,
    },
  );
  if (result.needsCode) {
    await setMeta('driveNeedsCode', true);
    return false;
  }
  if (result.pending) return false;
  if (result.token) {
    await db.meta.delete('driveNeedsCode');
    await setMeta('driveToken', result.token);
    await db.meta.delete('driveFlow');
    return true;
  }
  return false;
}
export async function disconnectDrive() {
  try {
    await driveRequest('disconnect');
  } catch (e) {
    if (!(e instanceof DriveClientError && [400, 401].includes(e.status))) throw e;
  }
  await db.meta.delete('driveToken');
  await db.meta.delete('driveFlow');
}
export async function renameDrive(label: string) {
  await driveRequest('rename', { label });
  await setMeta('driveInstallation', { ...(await installation()), label });
}
export const deleteDriveHistory = (id: string) => driveRequest('delete-history', { id });
// Preserve exact uploaded bytes for checksum verification and portable downloads.
async function rawSnapshot(id: string, guard?: () => Promise<void>) {
  const local = await installation(),
    token = await getMeta<string>('driveToken', '');
  await guard?.();
  const response = await fetch(`/api/backup/snapshots/${id}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-AhThatsWho': 'backup',
      'X-Backup-Device': local.device,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const data = await response.json();
    throw new DriveClientError(data.error || 'Could not load backup.', response.status);
  }
  return response.text();
}
export { rawSnapshot as downloadDriveSnapshot };
async function imageRequest(
  id: string,
  history?: string,
  image?: Blob,
  guard?: () => Promise<void>,
) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid person image identifier.');
  const local = await installation(),
    token = await getMeta<string>('driveToken', '');
  await guard?.();
  const response = await fetch(
    `/api/backup/assets/${id}${history ? `?history=${encodeURIComponent(history)}` : ''}`,
    {
      method: image ? 'PUT' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AhThatsWho': 'backup',
        'X-Backup-Device': local.device,
        ...(image ? { 'Content-Type': 'image/jpeg' } : {}),
      },
      body: image,
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    const data = await response.json();
    throw new DriveClientError(data.error || 'Could not recover person image.', response.status);
  }
  return response;
}
export async function downloadDriveImageAsset(history: string, id: string): Promise<Blob> {
  const response = await imageRequest(id, history);
  if (Number(response.headers.get('Content-Length')) > BACKUP_IMAGE_MAX_BYTES)
    throw new Error('Person image exceeds the 5 MiB limit.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Person image is missing from Google Drive.');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > BACKUP_IMAGE_MAX_BYTES) {
        await reader.cancel();
        throw new Error('Person image exceeds the 5 MiB limit.');
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  const image = new Blob(chunks, { type: 'image/jpeg' });
  await validateImageAsset(id, image);
  return image;
}
export function driveProvider(history: string, active: () => Promise<boolean>): BackupProvider {
  let verifiedId: string | undefined;
  async function guard() {
    if (!(await active())) throw new Error('The backup destination changed.');
  }
  async function ownSnapshots() {
    await guard();
    return (await driveHistories()).find((h) => h.id === history)?.snapshots || [];
  }
  return {
    async ensureImageAsset(id, read) {
      await guard();
      const result = await driveRequest<{ verified: boolean }>(
        `assets/${id}/verify`,
        undefined,
        'POST',
        guard,
      );
      await guard();
      if (!result.verified) {
        const image = await read();
        await guard();
        await validateImageAsset(id, image);
        await imageRequest(id, undefined, image, guard);
      }
      await guard();
    },
    async loadImageAsset(id) {
      await guard();
      const image = await downloadDriveImageAsset(history, id);
      await guard();
      return image;
    },
    async list() {
      return (await ownSnapshots()).map((s) => ({ ...s, id: s.snapshotId || s.id }));
    },
    async save(id, content) {
      await guard();
      const local = await installation(),
        token = await getMeta<string>('driveToken', '');
      await guard();
      const response = await fetch(`/api/backup/snapshots/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-AhThatsWho': 'backup',
          'X-Backup-Device': local.device,
          'X-Backup-Label': encodeURIComponent(local.label),
        },
        body: content,
      });
      const data = await response.json();
      if (!response.ok) throw new DriveClientError(data.error || 'Upload failed.', response.status);
    },
    async load(id) {
      await guard();
      const s = (await ownSnapshots()).find((v) => v.snapshotId === id || v.id === id);
      if (!s) throw new Error('Backup not found. Retry the upload.');
      const content = await rawSnapshot(s.id, guard);
      await guard();
      verifiedId = s.id;
      return content;
    },
    async prune() {
      await guard();
      if (verifiedId) await driveRequest('prune', { verifiedId }, 'POST', guard);
    },
  };
}
