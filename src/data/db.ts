import Dexie, { type Table } from 'dexie';
import {
  FORMAT_VERSION,
  now,
  uuid,
  type AudioRecord,
  type BackupState,
  type Capture,
  type Context,
  type Household,
  type HouseholdRecord,
  type Provenance,
  type Revision,
} from '../domain/types';
import { assert, semantic, validateHousehold } from '../domain/integrity';
export class AhThatsWhoDB extends Dexie {
  households!: Table<HouseholdRecord, string>;
  contexts!: Table<Context, string>;
  revisions!: Table<Revision, string>;
  inbox!: Table<Capture, string>;
  audio!: Table<AudioRecord, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  constructor(name = 'ahthatswho') {
    super(name);
    this.version(FORMAT_VERSION).stores({
      households: 'household.id,updatedAt,deletedAt',
      contexts: 'id',
      revisions: 'id,record.household.id',
      inbox: 'id,createdAt,stage',
      audio: 'id,captureId',
      meta: 'key',
    });
  }
}
export const db = new AhThatsWhoDB();
export async function getMeta<T>(key: string, fallback: T, d = db): Promise<T> {
  return ((await d.meta.get(key))?.value as T) ?? fallback;
}
export const setMeta = (key: string, value: unknown, d = db) => d.meta.put({ key, value });
export async function backupState(d = db) {
  return getMeta<BackupState>(
    'backup',
    { counter: 0, uploadedCounter: 0, generation: 'initial', authoritative: false },
    d,
  );
}
export async function dirty(d = db) {
  const s = await backupState(d);
  await setMeta('backup', { ...s, counter: s.counter + 1 }, d);
}
export async function archive(r: HouseholdRecord, d = db) {
  const contexts = await d.contexts.toArray();
  await d.revisions.add({
    id: uuid(),
    record: structuredClone(r),
    archivedAt: now(),
    contextNames: Object.fromEntries(
      contexts.filter((c) => r.household.contextIds.includes(c.id)).map((c) => [c.id, c.name]),
    ),
  });
}
export async function writeHousehold(
  h: Household,
  expected: string | undefined,
  source: Provenance,
  d = db,
  deletedAt?: string,
) {
  const current = await d.households.get(h.id);
  assert(current?.versionId === expected, 'This household changed. Reopen it before saving.');
  validateHousehold(h, new Set((await d.contexts.toArray()).map((c) => c.id)));
  const others = await d.households.toArray();
  const used = new Set(
    others
      .filter((r) => r.household.id !== h.id)
      .flatMap((r) => r.household.people.map((p) => p.id)),
  );
  assert(
    h.people.every((p) => !used.has(p.id)),
    'A person ID belongs to another household',
  );
  if (current && semantic(current.household) === semantic(h) && current.deletedAt === deletedAt)
    return current;
  if (current) await archive(current, d);
  const at = now();
  const result: HouseholdRecord = {
    household: structuredClone(h),
    versionId: uuid(),
    createdAt: current?.createdAt || at,
    updatedAt: at,
    source,
    ...(deletedAt ? { deletedAt } : {}),
  };
  await d.households.put(result);
  await dirty(d);
  return result;
}
export function saveHousehold(
  h: Household,
  expected?: string,
  source: Provenance = { kind: 'manual' },
  d = db,
) {
  return d.transaction(
    'rw',
    [d.households, d.contexts, d.revisions, d.meta],
    async () => await writeHousehold(h, expected, source, d),
  );
}
export function trashHousehold(id: string, expected: string, restore = false, d = db) {
  return d.transaction('rw', [d.households, d.contexts, d.revisions, d.meta], async () => {
    const r = await d.households.get(id);
    assert(r, 'Household no longer exists');
    return writeHousehold(
      r.household,
      expected,
      { kind: restore ? 'restore' : 'manual' },
      d,
      restore ? undefined : now(),
    );
  });
}
export function restoreRevision(revision: Revision, expected: string, d = db) {
  return d.transaction('rw', [d.households, d.contexts, d.revisions, d.meta], async () => {
    for (const [id, name] of Object.entries(revision.contextNames))
      if (!(await d.contexts.get(id))) await d.contexts.put({ id, name, favorite: false });
    return writeHousehold(revision.record.household, expected, { kind: 'restore' }, d);
  });
}
export function saveContext(c: Context, d = db) {
  return d.transaction('rw', [d.contexts, d.meta], async () => {
    assert(c.name.trim() && c.name.length <= 200, 'Enter a context name under 200 characters');
    await d.contexts.put({ ...c, name: c.name.trim() });
    await dirty(d);
  });
}
export function deleteContext(id: string, d = db) {
  return d.transaction('rw', [d.contexts, d.households, d.revisions, d.meta], async () => {
    for (const r of await d.households.toArray())
      if (r.household.contextIds.includes(id))
        await writeHousehold(
          { ...r.household, contextIds: r.household.contextIds.filter((c) => c !== id) },
          r.versionId,
          { kind: 'manual' },
          d,
          r.deletedAt,
        );
    await d.contexts.delete(id);
    await dirty(d);
  });
}
export function saveCapture(c: Capture, d = db) {
  return d.transaction('rw', [d.inbox, d.meta], async () => {
    await d.inbox.put(structuredClone(c));
    await dirty(d);
  });
}
export async function recoverInterrupted(d = db) {
  await d.transaction('rw', [d.inbox, d.audio, d.meta], async () => {
    for (const c of await d.inbox.toArray()) {
      if (c.stage === 'applied' || c.stage === 'discarded') {
        if (c.audioId) {
          await d.audio.delete(c.audioId);
          await d.inbox.update(c.id, { audioId: undefined });
        }
        continue;
      }
      let changed = false;
      if (c.attempt) {
        delete c.attempt;
        c.error = 'Processing was interrupted. Retry when ready.';
        changed = true;
      }
      if (c.audioId) {
        const audio = await d.audio.get(c.audioId);
        if (!audio?.chunks.length) {
          c.audioMissing = true;
          c.stage = c.text || c.transcript ? 'transcript-ready' : 'missing-source';
          changed = true;
        } else if (!audio.complete) {
          c.audioIncomplete = true;
          c.error = 'Recording was interrupted. Check playback before processing.';
          changed = true;
        }
      }
      if (changed) {
        await d.inbox.put(c);
        await dirty(d);
      }
    }
  });
}
