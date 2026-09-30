import type { CloudSnapshot, DriveHistory } from '../backup/contracts';
import { BACKUP_MAX_BYTES } from '../backup/contracts';
import { retainedSnapshots } from '../backup/retention';
import { parseBackup } from '../domain/integrity';
import {
  type DriveEnv,
  DriveError,
  bodyText,
  hash,
  hexHash,
  identifier,
  json,
  requireValue,
  sameOrigin,
} from './drive-common';
import { accessToken, historyId, session, type Session } from './drive-auth';
interface DriveFile {
  id: string;
  name: string;
  size?: string;
  appProperties: Record<string, string>;
}
const API = 'https://www.googleapis.com/drive/v3';
const FIELDS = 'id,name,size,appProperties';
export class DriveStorage {
  constructor(
    private env: DriveEnv,
    private s: Session,
    private token: string,
  ) {}
  private async request(path: string, init: RequestInit = {}, upload = false) {
    const r = await fetch(
      `${upload ? 'https://www.googleapis.com/upload/drive/v3' : API}/${path}`,
      {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!r.ok) {
      await r.body?.cancel();
      throw new DriveError(
        r.status === 401 ? 401 : r.status === 404 ? 404 : r.status === 409 ? 409 : 502,
        r.status === 401
          ? 'Reconnect Google Drive to resume backup.'
          : r.status === 404
            ? 'This backup is no longer available in Google Drive.'
            : 'Google Drive could not complete the backup operation. Retry later.',
      );
    }
    return r;
  }
  private async namespace() {
    return (await hash(this.s.origin)).slice(0, 24);
  }
  async list(): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let page: string | undefined;
    do {
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        pageSize: '1000',
        q: `trashed = false and appProperties has { key='app' and value='ahthatswho' } and appProperties has { key='origin' and value='${await this.namespace()}' }`,
        fields: `nextPageToken,files(${FIELDS})`,
        ...(page ? { pageToken: page } : {}),
      });
      const result = (await (await this.request(`files?${params}`)).json()) as {
        files: DriveFile[];
        nextPageToken?: string;
      };
      files.push(...result.files);
      page = result.nextPageToken;
    } while (page);
    return files;
  }
  async histories(): Promise<DriveHistory[]> {
    const files = await this.list();
    const histories = new Map<string, DriveHistory>();
    for (const f of files) {
      const p = f.appProperties;
      if (!p?.history || !['snapshot', 'history'].includes(p.kind)) continue;
      let h = histories.get(p.history);
      if (!h) {
        h = { id: p.history, label: 'Unnamed installation', snapshots: [] };
        histories.set(h.id, h);
      }
      if (p.kind === 'history') h.label = f.name;
      else if (p.exportedAt && p.digest)
        h.snapshots.push({
          id: f.id,
          snapshotId: p.snapshot,
          historyId: p.history,
          exportedAt: p.exportedAt,
          bytes: Number(f.size || 0),
          digest: p.digest,
          version: Number(p.version),
          households: Number(p.households),
          contexts: Number(p.contexts),
          captures: Number(p.captures),
        });
    }
    for (const h of histories.values()) {
      h.snapshots.sort(
        (a, b) => b.exportedAt.localeCompare(a.exportedAt) || b.id.localeCompare(a.id),
      );
      for (const s of h.snapshots) s.label = h.label;
    }
    return [...histories.values()].sort(
      (a, b) =>
        (b.snapshots[0]?.exportedAt || '').localeCompare(a.snapshots[0]?.exportedAt || '') ||
        a.id.localeCompare(b.id),
    );
  }
  async file(id: string): Promise<DriveFile> {
    identifier(id);
    const f = (await (await this.request(`files/${id}?fields=${FIELDS}`)).json()) as DriveFile;
    if (
      f.appProperties?.app !== 'ahthatswho' ||
      f.appProperties.origin !== (await this.namespace())
    )
      throw new DriveError(404, 'Backup not found.');
    return f;
  }
  async load(id: string) {
    const f = await this.file(id);
    requireValue(f.appProperties.kind === 'snapshot');
    const text = await bodyText(await this.request(`files/${id}?alt=media`), BACKUP_MAX_BYTES);
    if ((await hexHash(text)) !== f.appProperties.digest)
      throw new DriveError(502, 'Backup verification failed. Choose another snapshot.');
    return text;
  }
  private async allocatedId(snapshot: string, digest: string) {
    const h = await historyId(this.s);
    const db = this.env.BACKUP_DB!;
    const args = [this.s.origin, this.s.account_id, h, snapshot];
    let row = await db
      .prepare(
        'SELECT file_id,digest FROM drive_uploads WHERE origin=? AND account_id=? AND installation=? AND snapshot=?',
      )
      .bind(...args)
      .first<{ file_id: string; digest: string }>();
    if (!row) {
      const ids = (await (
        await this.request('files/generateIds?count=1&space=appDataFolder&type=files')
      ).json()) as { ids: string[] };
      await db
        .prepare(
          'INSERT OR IGNORE INTO drive_uploads(origin,account_id,installation,snapshot,file_id,digest) VALUES(?,?,?,?,?,?)',
        )
        .bind(...args, ids.ids[0], digest)
        .run();
      row = await db
        .prepare(
          'SELECT file_id,digest FROM drive_uploads WHERE origin=? AND account_id=? AND installation=? AND snapshot=?',
        )
        .bind(...args)
        .first<{ file_id: string; digest: string }>();
    }
    requireValue(
      row && row.digest === digest,
      'This snapshot ID was already used for different content.',
    );
    return row.file_id;
  }
  private async create(
    id: string,
    name: string,
    properties: Record<string, string>,
    content: string,
  ) {
    const boundary = `atw_${crypto.randomUUID()}`;
    const metadata = {
      id,
      name,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
      appProperties: {
        app: 'ahthatswho',
        origin: await this.namespace(),
        history: await historyId(this.s),
        ...properties,
      },
    };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ]);
    try {
      await this.request(
        'files?uploadType=multipart&fields=id',
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
        true,
      );
    } catch (e) {
      if (!(e instanceof DriveError && e.status === 409)) throw e;
    }
  }
  async rename(label: string) {
    requireValue(
      typeof label === 'string' && label.trim().length > 0 && label.length <= 80,
      'Use an installation name of 1–80 characters.',
    );
    const h = await historyId(this.s);
    const existing = (await this.list()).find(
      (f) => f.appProperties.history === h && f.appProperties.kind === 'history',
    );
    if (existing)
      await this.request(`files/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: label.trim() }),
      });
    else
      await this.create(
        await this.allocatedId('history', ''),
        label.trim(),
        { kind: 'history' },
        '{}',
      );
  }
  async save(snapshotId: string, content: string, label: string) {
    identifier(snapshotId);
    let backup;
    try {
      backup = parseBackup(content);
    } catch {
      throw new DriveError(400, 'Invalid portable notebook backup.');
    }
    const digest = await hexHash(content);
    const id = await this.allocatedId(snapshotId, digest);
    const h = await historyId(this.s);
    if (
      !(await this.list()).some(
        (f) => f.appProperties.history === h && f.appProperties.kind === 'history',
      )
    )
      await this.rename(label);
    // Export time is from server reception, so client clock skew cannot prune valid history.
    await this.create(
      id,
      `ahthatswho-${snapshotId}.json`,
      {
        kind: 'snapshot',
        snapshot: snapshotId,
        digest,
        exportedAt: new Date().toISOString(),
        version: String(backup.version),
        households: String(backup.households.length),
        contexts: String(backup.contexts.length),
        captures: String(backup.inbox.length),
      },
      content,
    );
    const retrieved = await this.load(id);
    if ((await hexHash(retrieved)) !== digest)
      throw new DriveError(502, 'Uploaded backup did not pass verification.');
    return { id };
  }
  async prune(verifiedId: string) {
    // Only prune after verifying a snapshot belonging to this installation.
    const verified = await this.file(verifiedId);
    const h = await historyId(this.s);
    requireValue(
      verified.appProperties.history === h && verified.appProperties.kind === 'snapshot',
    );
    await this.load(verifiedId);
    const snapshots = (await this.histories()).find((v) => v.id === h)?.snapshots || [];
    const keep = retainedSnapshots(snapshots);
    keep.add(verifiedId);
    for (const s of snapshots) if (!keep.has(s.id)) await this.removeFile(s.id);
  }
  private async removeFile(id: string) {
    try {
      await this.request(`files/${id}`, { method: 'DELETE' });
    } catch (e) {
      if (!(e instanceof DriveError && e.status === 404)) throw e;
    }
    await this.env
      .BACKUP_DB!.prepare('DELETE FROM drive_uploads WHERE origin=? AND account_id=? AND file_id=?')
      .bind(this.s.origin, this.s.account_id, id)
      .run();
  }
  async deleteHistory(id: string) {
    identifier(id);
    if (id === (await historyId(this.s)))
      throw new DriveError(
        409,
        'This is the current installation. Disconnect it before deleting its history from another installation.',
      );
    for (const f of await this.list())
      if (f.appProperties.history === id) await this.removeFile(f.id);
  }
}
export async function storageRoute(request: Request, env: DriveEnv) {
  sameOrigin(request);
  const s = await session(request, env);
  const storage = new DriveStorage(env, s, await accessToken(s, env));
  const path = new URL(request.url).pathname;
  if (path === '/api/backup/histories' && request.method === 'POST')
    return json(await storage.histories());
  if (path === '/api/backup/rename' && request.method === 'POST') {
    const input = JSON.parse(await bodyText(request, 1024));
    await storage.rename(input.label);
    return json({ renamed: true });
  }
  if (path === '/api/backup/prune' && request.method === 'POST') {
    const input = JSON.parse(await bodyText(request, 1024));
    identifier(input.verifiedId);
    await storage.prune(input.verifiedId);
    return json({ pruned: true });
  }
  if (path === '/api/backup/delete-history' && request.method === 'POST') {
    const input = JSON.parse(await bodyText(request, 1024));
    identifier(input.id);
    await storage.deleteHistory(input.id);
    return json({ deleted: true });
  }
  const match = path.match(/^\/api\/backup\/snapshots\/([a-zA-Z0-9_-]{16,128})$/);
  if (match && request.method === 'POST')
    return new Response(await storage.load(match[1]), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  if (match && request.method === 'PUT') {
    const label = request.headers.get('X-Backup-Label');
    requireValue(label && label.length <= 1024);
    return json(
      await storage.save(
        match[1],
        await bodyText(request, BACKUP_MAX_BYTES),
        decodeURIComponent(label),
      ),
    );
  }
  return json({ error: 'Not found.' }, 404);
}
