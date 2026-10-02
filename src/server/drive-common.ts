export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export interface DriveEnv {
  BACKUP_DB?: Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BACKUP_ENCRYPTION_KEY?: string;
  BACKUP_ORIGINS?: string;
}
export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireValue(value: unknown, message = 'Invalid backup request.'): asserts value {
  if (!value) throw new DriveError(400, message);
}
export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
export const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export function unb64(s: string) {
  return Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
}
export async function hash(s: string) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}
export async function hexHash(s: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
async function key(env: DriveEnv) {
  return crypto.subtle.importKey('raw', unb64(env.BACKUP_ENCRYPTION_KEY!), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function seal(env: DriveEnv, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(env),
    new TextEncoder().encode(text),
  );
  return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}
export async function unseal(env: DriveEnv, value: string) {
  const [iv, encrypted] = value.split('.');
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(iv) },
      await key(env),
      unb64(encrypted),
    ),
  );
}
export function configured(env: DriveEnv) {
  return !!(
    env.BACKUP_DB &&
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.BACKUP_ENCRYPTION_KEY &&
    env.BACKUP_ORIGINS
  );
}
export function allowedOrigin(request: Request, env: DriveEnv) {
  const origin = new URL(request.url).origin;
  if (
    !env.BACKUP_ORIGINS?.split(',')
      .map((v) => v.trim())
      .includes(origin)
  )
    throw new DriveError(403, 'Google Drive backup is not enabled on this address.');
  return origin;
}
export function sameOrigin(request: Request) {
  if (
    request.headers.get('Origin') !== new URL(request.url).origin ||
    request.headers.get('X-AhThatsWho') !== 'backup'
  )
    throw new DriveError(403, 'Open backup settings in AhThatsWho to continue.');
}
export function identifier(s: unknown): asserts s is string {
  requireValue(
    typeof s === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(s),
    'Invalid backup identifier.',
  );
}
export async function bodyText(request: Request | Response, max: number) {
  if (Number(request.headers.get('Content-Length')) > max)
    throw new DriveError(413, 'Backup exceeds the size limit.');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '',
    bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new DriveError(413, 'Backup exceeds the size limit.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export async function bodyBlob(request: Request | Response, max: number) {
  if (Number(request.headers.get('Content-Length')) > max)
    throw new DriveError(
      413,
      `Person image exceeds the ${Math.round(max / 1024 / 1024)} MiB limit.`,
    );
  const reader = request.body?.getReader();
  if (!reader) return new Blob([]);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new DriveError(
          413,
          `Person image exceeds the ${Math.round(max / 1024 / 1024)} MiB limit.`,
        );
      }
      chunks.push(new Uint8Array(value));
    }
    return new Blob(chunks, { type: 'image/jpeg' });
  } finally {
    reader.releaseLock();
  }
}
export async function blobHash(blob: Blob) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function googleToken(env: DriveEnv, params: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      ...params,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
  };
  if (!response.ok || !data.access_token)
    throw new DriveError(
      data.error === 'invalid_grant' ? 401 : 502,
      data.error === 'invalid_grant'
        ? 'Reconnect Google Drive to resume backup.'
        : 'Google authorization failed. Please retry.',
    );
  return data;
}
