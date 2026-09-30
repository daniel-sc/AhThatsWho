import {
  allowedOrigin,
  configured,
  DriveError,
  type DriveEnv,
  hash,
  identifier,
  json,
  random,
  requireValue,
  sameOrigin,
  seal,
  unseal,
  googleToken,
  bodyText,
} from './drive-common';
export const IDLE_MS = 90 * 86400000;
const FLOW_MS = 10 * 60000;
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
interface Flow {
  state_hash: string;
  claim_hash: string;
  origin: string;
  installation: string;
  device_hash: string;
  verifier: string;
  browser_hash: string | null;
  account_id: string | null;
  error: string | null;
  completion_hash: string | null;
  expires: number;
}
export interface Session {
  token_hash: string;
  origin: string;
  account_id: string;
  installation: string;
  device_hash: string;
  touched: number;
  email: string;
  refresh_token: string;
}
export const historyId = (s: Pick<Session, 'installation' | 'device_hash'>) =>
  hash(`${s.installation}:${s.device_hash}`);
export async function session(request: Request, env: DriveEnv): Promise<Session> {
  const origin = allowedOrigin(request, env);
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  const device = request.headers.get('X-Backup-Device') || '';
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token) || !/^[a-zA-Z0-9_-]{16,128}$/.test(device))
    throw new DriveError(401, 'Reconnect Google Drive to resume backup.');
  const s = await env
    .BACKUP_DB!.prepare(
      `SELECT s.*, a.email, a.refresh_token FROM drive_sessions s
    JOIN drive_accounts a ON a.origin=s.origin AND a.account_id=s.account_id WHERE s.token_hash=? AND s.origin=? AND s.device_hash=? AND s.touched>?`,
    )
    .bind(await hash(token), origin, await hash(device), Date.now() - IDLE_MS)
    .first<Session>();
  if (!s) throw new DriveError(401, 'Reconnect Google Drive to resume backup.');
  await env
    .BACKUP_DB!.prepare('UPDATE drive_sessions SET touched=? WHERE token_hash=?')
    .bind(Date.now(), s.token_hash)
    .run();
  return s;
}
export async function accessToken(s: Session, env: DriveEnv) {
  const token = await googleToken(env, {
    grant_type: 'refresh_token',
    refresh_token: await unseal(env, s.refresh_token),
  });
  return token.access_token!;
}
async function cleanup(env: DriveEnv) {
  const db = env.BACKUP_DB!;
  await db.batch([
    db.prepare('DELETE FROM drive_flows WHERE expires<?').bind(Date.now()),
    db.prepare('DELETE FROM drive_sessions WHERE touched<?').bind(Date.now() - IDLE_MS),
  ]);
  await db
    .prepare(
      `DELETE FROM drive_accounts WHERE NOT EXISTS
    (SELECT 1 FROM drive_sessions s WHERE s.origin=drive_accounts.origin AND s.account_id=drive_accounts.account_id)
    AND NOT EXISTS (SELECT 1 FROM drive_flows f WHERE f.origin=drive_accounts.origin AND f.account_id=drive_accounts.account_id AND f.expires>?)`,
    )
    .bind(Date.now())
    .run();
}
function returnPage(ok: boolean, completion = '') {
  // No app code or provider data on the callback page. Safari may open this outside the PWA.
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AhThatsWho backup</title><h1>${ok ? 'Google Drive connected' : 'Google Drive connection failed'}</h1><p>${ok ? 'Return to the AhThatsWho window where you started to finish connecting.' : 'Return to AhThatsWho and try connecting again.'}</p><p>${ok ? `If your original app asks for a connection code, copy this code into it: <strong>${completion}</strong>` : ''}</p><a href="/?backup=return">Return to AhThatsWho</a></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
export async function authRoute(request: Request, env: DriveEnv): Promise<Response | undefined> {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === '/api/backup/status' && request.method === 'GET') {
    if (!configured(env)) return json({ configured: false, connected: false });
    allowedOrigin(request, env);
    if (!request.headers.has('Authorization')) return json({ configured: true, connected: false });
    const s = await session(request, env);
    return json({
      configured: true,
      connected: true,
      accountId: s.account_id,
      email: s.email,
      installation: await historyId(s),
    });
  }
  if (!configured(env))
    throw new DriveError(
      503,
      'Google Drive backup is not configured yet. File export is available.',
    );
  const origin = allowedOrigin(request, env),
    db = env.BACKUP_DB!;
  if (path === '/api/backup/connect' && request.method === 'POST') {
    sameOrigin(request);
    const input = JSON.parse(await bodyText(request, 4096));
    identifier(input.installation);
    identifier(input.device);
    await cleanup(env);
    const state = random(),
      claim = random(),
      verifier = random();
    await db
      .prepare(
        'INSERT INTO drive_flows(state_hash,claim_hash,origin,installation,device_hash,verifier,expires) VALUES(?,?,?,?,?,?,?)',
      )
      .bind(
        await hash(state),
        await hash(claim),
        origin,
        input.installation,
        await hash(input.device),
        await seal(env, verifier),
        Date.now() + FLOW_MS,
      )
      .run();
    const response = json({ state, claim, url: `${origin}/api/backup/authorize?state=${state}` });
    response.headers.set(
      'Set-Cookie',
      `__Host-atw-oauth-${state.slice(0, 16)}=${random()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    );
    return response;
  }
  if (path === '/api/backup/authorize' && request.method === 'GET') {
    const state = url.searchParams.get('state');
    identifier(state);
    const stateHash = await hash(state);
    const flow = await db
      .prepare('SELECT * FROM drive_flows WHERE state_hash=? AND origin=? AND expires>?')
      .bind(stateHash, origin, Date.now())
      .first<Flow>();
    requireValue(
      flow && !flow.browser_hash,
      'This connection link expired. Start again in Settings.',
    );
    const cookieName = `__Host-atw-oauth-${state.slice(0, 16)}`;
    const browser =
      request.headers
        .get('Cookie')
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(cookieName + '='))
        ?.slice(cookieName.length + 1) || random();
    const updated = await db
      .prepare('UPDATE drive_flows SET browser_hash=? WHERE state_hash=? AND browser_hash IS NULL')
      .bind(await hash(browser), stateHash)
      .run();
    requireValue(updated.meta.changes === 1, 'Connection already started.');
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${origin}/api/backup/callback`,
      response_type: 'code',
      scope: `${SCOPE} openid email`,
      access_type: 'offline',
      prompt: 'consent select_account',
      state,
      code_challenge: await hash(await unseal(env, flow.verifier)),
      code_challenge_method: 'S256',
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: auth.href,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Set-Cookie': `__Host-atw-oauth-${state.slice(0, 16)}=${browser}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      },
    });
  }
  if (path === '/api/backup/callback' && request.method === 'GET') {
    const state = url.searchParams.get('state');
    identifier(state);
    const stateHash = await hash(state);
    const flow = await db
      .prepare('SELECT * FROM drive_flows WHERE state_hash=? AND origin=? AND expires>?')
      .bind(stateHash, origin, Date.now())
      .first<Flow>();
    requireValue(
      flow && !flow.account_id && !flow.error,
      'Connection expired. Start again in Settings.',
    );
    const cookieName = `__Host-atw-oauth-${state.slice(0, 16)}`;
    const browser = request.headers
      .get('Cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    requireValue(
      browser && (await hash(browser)) === flow.browser_hash,
      'Return to the browser where you started connecting.',
    );
    let ok = false;
    const completion = random().slice(0, 20);
    try {
      requireValue(
        !url.searchParams.has('error') && url.searchParams.get('code'),
        'Google connection was cancelled.',
      );
      const token = await googleToken(env, {
        grant_type: 'authorization_code',
        code: url.searchParams.get('code')!,
        redirect_uri: `${origin}/api/backup/callback`,
        code_verifier: await unseal(env, flow.verifier),
      });
      requireValue(
        token.scope?.split(' ').includes(SCOPE),
        'Backup storage permission was not granted.',
      );
      const identityResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!identityResponse.ok) throw new DriveError(502, 'Could not identify the Google account.');
      const identity = (await identityResponse.json()) as {
        sub: string;
        email: string;
        email_verified: boolean;
      };
      requireValue(
        typeof identity.sub === 'string' &&
          typeof identity.email === 'string' &&
          identity.email_verified,
      );
      const existing = await db
        .prepare('SELECT refresh_token FROM drive_accounts WHERE origin=? AND account_id=?')
        .bind(origin, identity.sub)
        .first<{ refresh_token: string }>();
      const credential = token.refresh_token
        ? await seal(env, token.refresh_token)
        : existing?.refresh_token;
      requireValue(credential, 'Reconnect and grant offline backup access.');
      await db.batch([
        db
          .prepare(
            'INSERT INTO drive_accounts(origin,account_id,email,refresh_token) VALUES(?,?,?,?) ON CONFLICT(origin,account_id) DO UPDATE SET email=excluded.email,refresh_token=excluded.refresh_token',
          )
          .bind(origin, identity.sub, identity.email, credential),
        db
          .prepare('UPDATE drive_flows SET account_id=?,completion_hash=? WHERE state_hash=?')
          .bind(identity.sub, await hash(completion), stateHash),
      ]);
      ok = true;
    } catch {
      await db
        .prepare('UPDATE drive_flows SET error=? WHERE state_hash=?')
        .bind('Connection failed or was cancelled. Please try again.', stateHash)
        .run();
    }
    return returnPage(ok, completion);
  }
  if (path === '/api/backup/finish' && request.method === 'POST') {
    sameOrigin(request);
    const input = JSON.parse(await bodyText(request, 4096));
    identifier(input.state);
    identifier(input.claim);
    identifier(input.device);
    const bindings = [
      await hash(input.state),
      origin,
      await hash(input.claim),
      await hash(input.device),
      Date.now(),
    ];
    const flow = await db
      .prepare(
        'SELECT * FROM drive_flows WHERE state_hash=? AND origin=? AND claim_hash=? AND device_hash=? AND expires>?',
      )
      .bind(...bindings)
      .first<Flow>();
    if (!flow) throw new DriveError(410, 'Connection expired. Please start again.');
    if (flow.error) throw new DriveError(400, flow.error);
    if (!flow.account_id) return json({ pending: true });
    const cookieName = `__Host-atw-oauth-${input.state.slice(0, 16)}`;
    const browser = request.headers
      .get('Cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    const sameBrowser = browser && (await hash(browser)) === flow.browser_hash;
    if (
      !sameBrowser &&
      (!input.completion ||
        typeof input.completion !== 'string' ||
        (await hash(input.completion.trim())) !== flow.completion_hash)
    )
      return json({ needsCode: true });
    // Claim and create the session atomically: cleanup cannot remove the account
    // between deleting its last flow and creating its first session.
    const token = random();
    const results = await db.batch([
      db
        .prepare(
          `DELETE FROM drive_sessions WHERE origin=? AND installation=? AND device_hash=?
        AND EXISTS (SELECT 1 FROM drive_flows WHERE state_hash=? AND origin=? AND claim_hash=? AND device_hash=? AND expires>?)`,
        )
        .bind(origin, flow.installation, flow.device_hash, ...bindings),
      db
        .prepare(
          `INSERT INTO drive_sessions(token_hash,origin,account_id,installation,device_hash,touched)
        SELECT ?,origin,account_id,installation,device_hash,? FROM drive_flows
        WHERE state_hash=? AND origin=? AND claim_hash=? AND device_hash=? AND expires>? AND account_id IS NOT NULL`,
        )
        .bind(await hash(token), Date.now(), ...bindings),
      db
        .prepare(
          'DELETE FROM drive_flows WHERE state_hash=? AND origin=? AND claim_hash=? AND device_hash=? AND expires>?',
        )
        .bind(...bindings),
    ]);
    if ((results[1] as { meta: { changes: number } }).meta.changes !== 1)
      throw new DriveError(410, 'Connection already completed.');
    await cleanup(env);
    const response = json({ token });
    response.headers.set(
      'Set-Cookie',
      `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
    return response;
  }
  if (path === '/api/backup/disconnect' && request.method === 'POST') {
    sameOrigin(request);
    const s = await session(request, env);
    await db.prepare('DELETE FROM drive_sessions WHERE token_hash=?').bind(s.token_hash).run();
    await cleanup(env);
    return json({ disconnected: true });
  }
}
