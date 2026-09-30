import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { driveRequest } from '../src/server/drive';
import {
  hash,
  seal,
  unseal,
  type Database,
  type DriveEnv,
  type Statement,
  hexHash,
} from '../src/server/drive-common';
import { historyId, IDLE_MS, type Session } from '../src/server/drive-auth';
import { fixtures } from '../src/domain/fixtures';
import { retainedSnapshots } from '../src/backup/retention';
import type { CloudSnapshot } from '../src/backup/contracts';
let sqlite: DatabaseSync;
let env: DriveEnv;
const origin = 'https://preview.example';
const token = 'test-session-token-1234567890';
const device = 'test-device-secret-1234567890';
const installation = 'test-installation-1234567890';
const fetchMock = vi.fn();
function database(): Database {
  function statement(sql: string, args: unknown[] = []): Statement {
    return {
      bind: (...values) => statement(sql, values),
      async first<T>() {
        return (sqlite.prepare(sql).get(...(args as [])) as T) ?? null;
      },
      async all<T>() {
        return { results: sqlite.prepare(sql).all(...(args as [])) as T[] };
      },
      async run() {
        return { meta: { changes: Number(sqlite.prepare(sql).run(...(args as [])).changes) } };
      },
    };
  }
  return {
    prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const r = [];
        for (const s of statements) r.push(await s.run());
        sqlite.exec('COMMIT');
        return r;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
function request(path: string, body?: unknown, method = 'POST', auth = token) {
  return new Request(origin + '/api/backup/' + path, {
    method,
    headers: {
      Origin: origin,
      'X-AhThatsWho': 'backup',
      Authorization: `Bearer ${auth}`,
      'X-Backup-Device': device,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function seed(
  account = 'google-sub-1',
  auth = token,
  install = installation,
  secret = device,
) {
  await env
    .BACKUP_DB!.prepare('INSERT OR REPLACE INTO drive_accounts VALUES(?,?,?,?)')
    .bind(origin, account, 'test@example.com', await seal(env, 'synthetic-refresh-token'))
    .run();
  await env
    .BACKUP_DB!.prepare('INSERT INTO drive_sessions VALUES(?,?,?,?,?,?)')
    .bind(await hash(auth), origin, account, install, await hash(secret), Date.now())
    .run();
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_drive.sql', 'utf8'));
  sqlite.exec(readFileSync('migrations/0002_oauth_completion.sql', 'utf8'));
  env = {
    BACKUP_DB: database(),
    GOOGLE_CLIENT_ID: 'synthetic-client',
    GOOGLE_CLIENT_SECRET: 'synthetic-secret',
    BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
    BACKUP_ORIGINS: origin,
  };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  sqlite.close();
  vi.unstubAllGlobals();
});
it('encrypts credentials and never returns them in status', async () => {
  await seed();
  const row = sqlite.prepare('SELECT refresh_token FROM drive_accounts').get()!;
  expect(row.refresh_token).not.toContain('synthetic');
  expect(await unseal(env, row.refresh_token as string)).toBe('synthetic-refresh-token');
  const r = await driveRequest(request('status', undefined, 'GET'), env);
  const text = await r.text();
  expect(r.status).toBe(200);
  expect(text).toContain('test@example.com');
  expect(text).not.toContain('refresh');
  expect(r.headers.get('Cache-Control')).toBe('no-store');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('requires both session and installation secret, and isolates origins', async () => {
  await seed();
  const wrong = request('status', undefined, 'GET');
  wrong.headers.set('X-Backup-Device', 'different-device-1234567890');
  expect((await driveRequest(wrong, env)).status).toBe(401);
  const other = new Request('https://evil.example/api/backup/status', {
    headers: request('status').headers,
  });
  expect((await driveRequest(other, env)).status).toBe(403);
  const csrf = request('histories');
  csrf.headers.set('Origin', 'https://evil.example');
  expect((await driveRequest(csrf, env)).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('expires sessions after 90 idle days and slides active sessions', async () => {
  await seed();
  sqlite.prepare('UPDATE drive_sessions SET touched=?').run(Date.now() - IDLE_MS - 1);
  expect((await driveRequest(request('status', undefined, 'GET'), env)).status).toBe(401);
  sqlite.prepare('UPDATE drive_sessions SET touched=?').run(Date.now() - 86400000);
  expect((await driveRequest(request('status', undefined, 'GET'), env)).status).toBe(200);
  expect(
    Number(sqlite.prepare('SELECT touched FROM drive_sessions').get()!.touched),
  ).toBeGreaterThan(Date.now() - 1000);
});
it('disconnects only one installation and removes unused credentials after the last disconnect', async () => {
  await seed();
  await seed(
    'google-sub-1',
    'second-session-1234567890',
    'second-installation-123456',
    'second-secret-1234567890',
  );
  expect((await driveRequest(request('disconnect'), env)).status).toBe(200);
  expect(sqlite.prepare('SELECT * FROM drive_sessions').all()).toHaveLength(1);
  expect(sqlite.prepare('SELECT * FROM drive_accounts').all()).toHaveLength(1);
  const second = request('disconnect', undefined, 'POST', 'second-session-1234567890');
  second.headers.set('X-Backup-Device', 'second-secret-1234567890');
  expect((await driveRequest(second, env)).status).toBe(200);
  expect(sqlite.prepare('SELECT * FROM drive_accounts').all()).toHaveLength(0);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('binds OAuth to its browser and claims the finished connection only once', async () => {
  const start = await driveRequest(request('connect', { installation, device }), env);
  const flow = await start.json();
  const authorize = await driveRequest(new Request(flow.url), env);
  expect(authorize.status).toBe(302);
  const google = new URL(authorize.headers.get('Location')!);
  expect(google.searchParams.get('access_type')).toBe('offline');
  expect(google.searchParams.get('code_challenge_method')).toBe('S256');
  expect(google.searchParams.get('scope')).toContain('drive.appdata');
  const callback = `${origin}/api/backup/callback?state=${flow.state}&code=synthetic-code`;
  expect((await driveRequest(new Request(callback), env)).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock
    .mockResolvedValueOnce(
      Response.json({
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
        scope: 'openid email https://www.googleapis.com/auth/drive.appdata',
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ sub: 'google-user', email: 'test@example.com', email_verified: true }),
    );
  const result = await driveRequest(
    new Request(callback, {
      headers: { Cookie: authorize.headers.get('Set-Cookie')!.split(';')[0] },
    }),
    env,
  );
  expect(result.status).toBe(200);
  expect(await result.text()).toContain('Google Drive connected');
  const claim = { ...flow, device };
  expect(await (await driveRequest(request('finish', claim), env)).json()).toEqual({
    needsCode: true,
  });
  const finish = request('finish', claim);
  finish.headers.set('Cookie', authorize.headers.get('Set-Cookie')!.split(';')[0]);
  const finished = await driveRequest(finish, env);
  expect(finished.status).toBe(200);
  expect((await finished.json()).token).toBeTruthy();
  expect((await driveRequest(request('finish', claim), env)).status).toBe(410);
  expect(sqlite.prepare('SELECT * FROM drive_sessions').all()).toHaveLength(1);
});
it('does not finish pending flows, rejects stolen claims and records denied authorization', async () => {
  const flow = await (await driveRequest(request('connect', { installation, device }), env)).json();
  expect(await (await driveRequest(request('finish', { ...flow, device }), env)).json()).toEqual({
    pending: true,
  });
  expect(
    (
      await driveRequest(
        request('finish', { ...flow, claim: 'wrong-claim-1234567890', device }),
        env,
      )
    ).status,
  ).toBe(410);
  const a = await driveRequest(new Request(flow.url), env);
  await driveRequest(
    new Request(`${origin}/api/backup/callback?state=${flow.state}&error=access_denied`, {
      headers: { Cookie: a.headers.get('Set-Cookie')!.split(';')[0] },
    }),
    env,
  );
  expect((await driveRequest(request('finish', { ...flow, device }), env)).status).toBe(400);
});
it('uses device secrets to distinguish histories even when public IDs collide', async () => {
  expect(await historyId({ installation, device_hash: await hash(device) })).not.toBe(
    await historyId({ installation, device_hash: await hash('other-device') }),
  );
});
it('retains recent snapshots and daily recovery points beyond a burst of edits', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const entries: CloudSnapshot[] = [];
  for (let day = 0; day < 40; day++)
    for (let edit = 0; edit < 15; edit++)
      entries.push({
        id: `${day}-${edit}`,
        exportedAt: new Date(now - day * 86400000 - edit * 1000).toISOString(),
        bytes: 10,
        digest: '',
        version: 1,
      });
  const keep = retainedSnapshots(entries, now);
  expect(keep.size).toBe(39);
  expect(keep.has('0-9')).toBe(true);
  expect(keep.has('0-10')).toBe(false);
  expect(keep.has('29-0')).toBe(true);
  expect(keep.has('30-0')).toBe(false);
});
// A fake Drive server exercises the real Worker routes, D1 idempotency, and retention.
async function fakeDrive() {
  await seed();
  const files = new Map<
    string,
    {
      id: string;
      name: string;
      appProperties: Record<string, string>;
      size: string;
      content: string;
    }
  >();
  let next = 0;
  fetchMock.mockImplementation(async (urlValue: string, init: RequestInit = {}) => {
    const u = new URL(urlValue),
      method = init.method || 'GET';
    if (u.hostname === 'oauth2.googleapis.com')
      return Response.json({ access_token: 'synthetic-access' });
    if (u.pathname.endsWith('/generateIds'))
      return Response.json({ ids: [`google-file-${String(++next).padStart(16, '0')}`] });
    if (u.pathname === '/drive/v3/files')
      return Response.json({ files: [...files.values()].map(({ content: _, ...f }) => f) });
    if (u.pathname === '/upload/drive/v3/files') {
      const text = await (init.body as Blob).text();
      const pieces = text.split('\r\n\r\n');
      const metadata = JSON.parse(pieces[1].split('\r\n--')[0]);
      const content = pieces[2].split('\r\n--')[0];
      if (files.has(metadata.id)) return new Response(null, { status: 409 });
      files.set(metadata.id, {
        ...metadata,
        content,
        size: String(new TextEncoder().encode(content).length),
      });
      return Response.json({ id: metadata.id });
    }
    const id = u.pathname.split('/').pop()!,
      f = files.get(id);
    if (!f) return new Response(null, { status: 404 });
    if (method === 'DELETE') {
      files.delete(id);
      return new Response(null, { status: 204 });
    }
    if (method === 'PATCH') {
      Object.assign(f, JSON.parse(init.body as string));
      return Response.json(f);
    }
    if (u.searchParams.get('alt') === 'media') return new Response(f.content);
    return Response.json(f);
  });
  return files;
}
it('uploads idempotently, verifies bytes, lists counts and restores across histories', async () => {
  const files = await fakeDrive();
  const b = fixtures(3),
    id = 'snapshot-original-12345678';
  const upload = () => {
    const r = request(`snapshots/${id}`, b, 'PUT');
    r.headers.set('X-Backup-Label', 'Phone');
    return r;
  };
  expect((await driveRequest(upload(), env)).status).toBe(200);
  expect((await driveRequest(upload(), env)).status).toBe(200);
  expect(files.size).toBe(2);
  const histories = await (await driveRequest(request('histories'), env)).json();
  expect(histories[0].label).toBe('Phone');
  expect(histories[0].snapshots[0].households).toBe(3);
  expect(histories[0].snapshots[0].snapshotId).toBe(id);
  const fileId = histories[0].snapshots[0].id;
  expect(await (await driveRequest(request(`snapshots/${fileId}`), env)).json()).toEqual(b);
  const changed = upload();
  const different = request(`snapshots/${id}`, fixtures(4), 'PUT');
  different.headers.set('X-Backup-Label', 'Phone');
  expect((await driveRequest(different, env)).status).toBe(400);
  const file = files.get(fileId)!;
  file.content = '{}';
  expect((await driveRequest(request(`snapshots/${fileId}`), env)).status).toBe(502);
});
it('never automatically prunes another installation history', async () => {
  const files = await fakeDrive();
  const namespace = (await hash(origin)).slice(0, 24),
    h = await historyId({ installation, device_hash: await hash(device) });
  const content = JSON.stringify(fixtures(1)),
    digest = await hexHash(content);
  for (const history of [h, 'another-installation-history'])
    for (let i = 0; i < 15; i++) {
      const id = `snapshot-${history.slice(0, 8)}-${String(i).padStart(10, '0')}`;
      files.set(id, {
        id,
        name: id,
        size: String(content.length),
        content,
        appProperties: {
          app: 'ahthatswho',
          origin: namespace,
          history,
          kind: 'snapshot',
          digest,
          exportedAt: new Date(Date.now() - i * 1000).toISOString(),
          version: '1',
          households: '1',
          contexts: '3',
          captures: '0',
        },
      });
    }
  const own = [...files.values()].filter((f) => f.appProperties.history === h);
  expect((await driveRequest(request('prune', { verifiedId: own[0].id }), env)).status).toBe(200);
  expect([...files.values()].filter((f) => f.appProperties.history === h)).toHaveLength(10);
  expect([...files.values()].filter((f) => f.appProperties.history !== h)).toHaveLength(15);
  const other = [...files.values()].find((f) => f.appProperties.history !== h)!;
  expect((await driveRequest(request('prune', { verifiedId: other.id }), env)).status).toBe(400);
  expect((await driveRequest(request('delete-history', { id: h }), env)).status).toBe(409);
});

it('rejects expired OAuth flows and unconfigured deployment without contacting Google', async () => {
  const flow = await (await driveRequest(request('connect', { installation, device }), env)).json();
  sqlite.prepare('UPDATE drive_flows SET expires=?').run(Date.now() - 1);
  expect((await driveRequest(request('finish', { ...flow, device }), env)).status).toBe(410);
  expect((await driveRequest(new Request(flow.url), env)).status).toBe(400);
  expect(await (await driveRequest(request('status', undefined, 'GET'), {})).json()).toEqual({
    configured: false,
    connected: false,
  });
  expect((await driveRequest(request('connect', { installation, device }), {})).status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('reconciles an upload whose successful Google response was lost', async () => {
  const files = await fakeDrive();
  const handler = fetchMock.getMockImplementation()!;
  let lost = false;
  fetchMock.mockImplementation(async (...args: unknown[]) => {
    const result = await handler(...args);
    if (String(args[0]).includes('/upload/') && files.size === 2 && !lost) {
      lost = true;
      throw new Error('Synthetic lost response');
    }
    return result;
  });
  const upload = () => {
    const r = request('snapshots/uncertain-snapshot-12345', fixtures(2), 'PUT');
    r.headers.set('X-Backup-Label', 'Phone');
    return r;
  };
  expect((await driveRequest(upload(), env)).status).toBe(502);
  expect(files.size).toBe(2);
  expect((await driveRequest(upload(), env)).status).toBe(200);
  expect(files.size).toBe(2);
});

it('rejects a corrupted uploaded snapshot before any pruning', async () => {
  const files = await fakeDrive();
  const handler = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (...args: unknown[]) => {
    const result = await handler(...args);
    if (String(args[0]).includes('/upload/'))
      for (const f of files.values()) if (f.appProperties.kind === 'snapshot') f.content = '{}';
    return result;
  });
  const r = request('snapshots/corrupted-snapshot-12345', fixtures(2), 'PUT');
  r.headers.set('X-Backup-Label', 'Phone');
  expect((await driveRequest(r, env)).status).toBe(502);
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
});

it('requires the return-page code when Google opened in a different browser', async () => {
  const started = await driveRequest(request('connect', { installation, device }), env);
  const originalCookie = started.headers.get('Set-Cookie')!.split(';')[0];
  const flow = await started.json();
  const browser = await driveRequest(new Request(flow.url), env);
  fetchMock
    .mockResolvedValueOnce(
      Response.json({
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
        scope: 'openid email https://www.googleapis.com/auth/drive.appdata',
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ sub: 'other-browser-user', email: 'test@example.com', email_verified: true }),
    );
  const callback = await driveRequest(
    new Request(`${origin}/api/backup/callback?state=${flow.state}&code=synthetic-code`, {
      headers: { Cookie: browser.headers.get('Set-Cookie')!.split(';')[0] },
    }),
    env,
  );
  const html = await callback.text();
  const completion = html.match(/<strong>([^<]+)<\/strong>/)![1];
  const claim = request('finish', { ...flow, device });
  claim.headers.set('Cookie', originalCookie);
  expect(await (await driveRequest(claim, env)).json()).toEqual({ needsCode: true });
  const finish = await driveRequest(request('finish', { ...flow, device, completion }), env);
  expect(finish.status).toBe(200);
  expect((await finish.json()).token).toBeTruthy();
});
