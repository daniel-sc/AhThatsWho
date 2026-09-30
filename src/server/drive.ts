import { authRoute } from './drive-auth';
import { storageRoute } from './drive-storage';
import { DriveError, json, type DriveEnv } from './drive-common';
export async function driveRequest(request: Request, env: DriveEnv) {
  try {
    return (await authRoute(request, env)) ?? (await storageRoute(request, env));
  } catch (e) {
    // Provider bodies, OAuth codes, credentials and notebook payloads are never logged.
    if (e instanceof DriveError) return json({ error: e.message }, e.status);
    return json({ error: 'Backup request failed. Please retry or reconnect Google Drive.' }, 502);
  }
}
