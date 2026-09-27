import { assert } from '../domain/integrity';
import { digest } from '../backup/portable';
export interface CloudConfig {
  container: string;
  apiToken: string;
  environment: 'development' | 'production';
}
export interface CloudSnapshot {
  id: string;
  exportedAt: string;
  bytes: number;
  digest: string;
  version: number;
}
export interface BackupProvider {
  list(): Promise<CloudSnapshot[]>;
  save(id: string, json: string, hash: string): Promise<void>;
  load(id: string): Promise<string>;
  prune(keep: number): Promise<void>;
}
type CKRecord = {
  recordName: string;
  recordType: string;
  fields: Record<string, { value: unknown }>;
};
type CKResponse = {
  hasErrors: boolean;
  errors?: { ckErrorCode?: string }[];
  records: CKRecord[];
  moreComing?: boolean;
};
type CKDatabase = {
  saveRecords(r: CKRecord): Promise<CKResponse>;
  fetchRecords(ids: string[]): Promise<CKResponse>;
  performQuery(q: unknown, options?: unknown): Promise<CKResponse>;
  deleteRecords(ids: string[]): Promise<CKResponse>;
};
type Container = {
  privateCloudDatabase: CKDatabase;
  setUpAuth(): Promise<unknown>;
  whenUserSignsIn(): Promise<unknown>;
  whenUserSignsOut(): Promise<unknown>;
};
declare global {
  interface Window {
    CloudKit?: { configure(config: unknown): void; getDefaultContainer(): Container };
  }
}
let loading: Promise<void> | undefined;
function loadSDK() {
  if (window.CloudKit) return Promise.resolve();
  return (loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.apple-cloudkit.com/ck/2/cloudkit.js';
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error('Apple sign-in could not load. Check your connection.'));
    };
    document.head.append(script);
  }));
}
function checked(r: CKResponse) {
  if (r.hasErrors)
    throw new Error(
      `CloudKit request failed (${r.errors?.[0]?.ckErrorCode || 'unknown'}). Check sign-in and retry.`,
    );
  return r.records;
}
function metadata(r: CKRecord): CloudSnapshot {
  const f = r.fields;
  return {
    id: r.recordName,
    exportedAt: String(f.exportedAt?.value),
    bytes: Number(f.byteLength?.value),
    digest: String(f.digest?.value),
    version: Number(f.formatVersion?.value),
  };
}
export async function connectCloud(config: CloudConfig, onAuth: (signedIn: boolean) => void) {
  await loadSDK();
  window.CloudKit!.configure({
    containers: [
      {
        containerIdentifier: config.container,
        apiTokenAuth: {
          apiToken: config.apiToken,
          persist: true,
          signInButton: { id: 'apple-sign-in', theme: 'black' },
          signOutButton: { id: 'apple-sign-out', theme: 'black' },
        },
        environment: config.environment,
      },
    ],
  });
  const container = window.CloudKit!.getDefaultContainer();
  const database = container.privateCloudDatabase;
  async function auth() {
    onAuth(!!(await container.setUpAuth()));
  }
  void (async () => {
    while (true) {
      await container.whenUserSignsIn();
      onAuth(true);
      await container.whenUserSignsOut();
      onAuth(false);
    }
  })().catch(() => onAuth(false));
  await auth();
  const provider: BackupProvider = {
    async list() {
      const result: CloudSnapshot[] = [];
      let q: unknown = {
        recordType: 'NameCueSnapshot',
        sortBy: [{ fieldName: 'exportedAt', ascending: false }],
      };
      do {
        const response = await database.performQuery(q, { resultsLimit: 100 });
        result.push(...checked(response).map(metadata));
        if (!response.moreComing) break;
        q = response;
      } while (result.length < 10000);
      return result.sort(
        (a, b) => b.exportedAt.localeCompare(a.exportedAt) || a.id.localeCompare(b.id),
      );
    },
    async save(id, json, hash) {
      const b = JSON.parse(json);
      checked(
        await database.saveRecords({
          recordName: id,
          recordType: 'NameCueSnapshot',
          fields: {
            payload: { value: new Blob([json], { type: 'application/json' }) },
            exportedAt: { value: b.exportedAt },
            formatVersion: { value: b.version },
            byteLength: { value: new TextEncoder().encode(json).length },
            digest: { value: hash },
          },
        }),
      );
    },
    async load(id) {
      const record = checked(await database.fetchRecords([id]))[0];
      assert(record, 'Snapshot no longer exists');
      const asset = record.fields.payload?.value as { downloadURL?: string };
      assert(asset?.downloadURL, 'Snapshot asset is missing');
      const url = new URL(asset.downloadURL.replace('${f}', 'namecue.json'));
      assert(
        url.protocol === 'https:' &&
          (url.hostname.endsWith('.icloud-content.com') ||
            url.hostname.endsWith('.apple.com') ||
            url.hostname.endsWith('.icloud.com')),
        'Unexpected CloudKit asset host',
      );
      const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
      assert(r.ok, 'Snapshot download failed');
      const blob = await r.blob();
      assert(blob.size <= 50 * 1024 * 1024, 'Snapshot exceeds 50 MB');
      const json = await blob.text();
      const meta = metadata(record);
      assert(
        new TextEncoder().encode(json).length === meta.bytes &&
          (await digest(json)) === meta.digest,
        'Snapshot integrity check failed',
      );
      return json;
    },
    async prune(keep) {
      const records = await provider.list();
      for (let i = keep; i < records.length; i += 100)
        checked(await database.deleteRecords(records.slice(i, i + 100).map((r) => r.id)));
    },
  };
  return { provider, auth };
}
