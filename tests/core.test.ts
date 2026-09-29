import { afterEach, describe, it, expect } from 'vitest';
import {
  AhThatsWhoDB,
  saveHousehold,
  saveCapture,
  saveContext,
  backupState,
  deleteContext,
  trashHousehold,
  restoreRevision,
  setMeta,
  getMeta,
} from '../src/data/db';
import { fixtures } from '../src/domain/fixtures';
import { normalize, search } from '../src/domain/search';
import { parseBackup, validDate } from '../src/domain/integrity';
import { snapshot, replaceData, recoverSafety, digest } from '../src/backup/portable';
import {
  applyCapture,
  saveAndApplyCapture,
  manualProposal,
  storeProposal,
  updateTranscript,
} from '../src/capture/application';
import { BackupCoordinator } from '../src/backup/coordinator';
import type { BackupProvider } from '../src/providers/cloudkit';
import { now, uuid, type Capture } from '../src/domain/types';
const databases: AhThatsWhoDB[] = [];
function database() {
  const d = new AhThatsWhoDB(`test-${uuid()}`);
  databases.push(d);
  return d;
}
async function seed(d: AhThatsWhoDB) {
  const b = fixtures(3);
  await replaceData(b, d);
  return b;
}
afterEach(async () => {
  for (const d of databases) await d.delete();
  databases.length = 0;
});
describe('household search', () => {
  it('normalizes German and accent forms', () => {
    expect(normalize('  GRÜßE  Zoë ')).toBe('grusse zoe');
  });
  it('matches words across people and fields and preserves last-edit ordering', () => {
    const b = fixtures(12);
    const result = search(b.households, b.contexts, 'mattias robin');
    expect(result.rows.map((r) => r.household.id)).toEqual(['synthetic-8']);
    expect(search(b.households, b.contexts, 'example').rows[0].household.id).toBe('synthetic-0');
  });
  it('applies context before fallback, never falls back on empty browse', () => {
    const b = fixtures(12);
    expect(search(b.households, b.contexts, 'example', 'school').rows).toHaveLength(4);
    const x = search(b.households, b.contexts, 'mattias', 'school');
    expect(x.fallback).toBe(true);
    expect(x.rows).toHaveLength(1);
    expect(search(b.households, b.contexts, '', 'unused')).toEqual({ rows: [], fallback: false });
  });
  it('keeps a local fuzzy match instead of a global exact match', () => {
    const b = fixtures(2);
    b.households[0].household.people[0].firstName = { value: 'Matthias' };
    b.households[1].household.people[0].firstName = { value: 'Mattias' };
    expect(
      search(b.households, b.contexts, 'mattias', 'school').rows.map((r) => r.household.id),
    ).toEqual(['synthetic-0']);
  });
  it('excludes IDs and trash, and does not fuzz short words', () => {
    const b = fixtures(3);
    b.households[0].household.id = 'zzprivateid';
    expect(search(b.households, b.contexts, 'zzprivateid').rows).toHaveLength(0);
    b.households[0].deletedAt = now();
    expect(search(b.households, b.contexts, 'elena').rows).toHaveLength(0);
    expect(search(b.households, b.contexts, 'ely').rows).toHaveLength(0);
  });
});
describe('transactions and history', () => {
  it('avoids semantic no-op revisions and preserves displaced provenance', async () => {
    const d = database();
    const b = await seed(d);
    const old = b.households[0];
    const state = await backupState(d);
    await saveHousehold(old.household, old.versionId, { kind: 'llm' }, d);
    expect(await d.revisions.count()).toBe(0);
    expect((await backupState(d)).counter).toBe(state.counter);
    const h = { ...old.household, cue: 'New cue' };
    const saved = await saveHousehold(h, old.versionId, { kind: 'llm' }, d);
    const revision = (await d.revisions.toArray())[0];
    expect(revision.record.source.kind).toBe('manual');
    expect(revision.record.versionId).toBe(old.versionId);
    expect(saved.household.people[0].id).toBe(old.household.people[0].id);
    await expect(saveHousehold(h, old.versionId, { kind: 'manual' }, d)).rejects.toThrow('changed');
  });
  it('restores snapshots, deletes contexts atomically including trash, preserves labels', async () => {
    const d = database();
    const b = await seed(d);
    let r = await trashHousehold(b.households[0].household.id, b.households[0].versionId, false, d);
    await deleteContext('school', d);
    r = (await d.households.get(r.household.id))!;
    expect(r.household.contextIds).toEqual([]);
    expect(r.deletedAt).toBeTruthy();
    const rev = (await d.revisions.toArray()).find((r) => r.contextNames.school)!;
    expect(rev.contextNames.school).toBe('School');
    const restored = await restoreRevision(rev, r.versionId, d);
    expect(restored.deletedAt).toBeUndefined();
    expect((await d.contexts.get('school'))?.name).toBe('School');
  });
  it('represents unknown people and validates calendar precision', async () => {
    const d = database();
    await saveHousehold(
      {
        id: uuid(),
        people: [{ id: uuid(), birthDate: { value: { kind: 'month-day', month: 2, day: 29 } } }],
        contextIds: [],
      },
      undefined,
      undefined,
      d,
    );
    expect(() => validDate({ kind: 'date', year: 2023, month: 2, day: 29 })).toThrow();
    expect(() => validDate({ kind: 'month-day', month: 2, day: 29 })).not.toThrow();
  });
});
describe('capture application', () => {
  async function capture(d: AhThatsWhoDB) {
    const b = await seed(d);
    const r = b.households[0];
    const c: Capture = {
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
      kind: 'text',
      text: 'Update the cue',
      hints: {},
      stage: 'proposed',
      proposal: manualProposal({ ...r.household, cue: 'Red bicycle' }, r),
    };
    await saveCapture(c, d);
    return { b, r, c };
  }
  it('applies once and rejects stale proposals without overwriting', async () => {
    const d = database();
    const { c } = await capture(d);
    const first = await applyCapture(c.id, true, d);
    expect(await applyCapture(c.id, true, d)).toEqual(first);
    expect(await d.revisions.count()).toBe(1);
    const current = (await d.households.get(first.householdId))!;
    const next = {
      ...c,
      id: uuid(),
      proposal: manualProposal({ ...current.household, cue: 'Other cue' }, current),
    };
    await saveCapture(next, d);
    await saveHousehold(
      { ...current.household, notes: 'A newer fact' },
      current.versionId,
      undefined,
      d,
    );
    await expect(applyCapture(next.id, true, d)).rejects.toThrow('stale');
    expect((await d.households.get(first.householdId))?.household.notes).toBe('A newer fact');
  });
  it('saves and applies edited suggestions once, and rolls back stale edits', async () => {
    const d = database();
    const { c, r } = await capture(d);
    const edited = manualProposal({ ...r.household, cue: 'Edited suggestion' }, r);
    const receipt = await saveAndApplyCapture(c.id, edited, d);
    expect(await saveAndApplyCapture(c.id, edited, d)).toEqual(receipt);
    expect((await d.households.get(r.household.id))?.household.cue).toBe('Edited suggestion');
    expect(await d.revisions.count()).toBe(1);
    const next = { ...c, id: uuid() };
    await saveCapture(next, d);
    await expect(saveAndApplyCapture(next.id, edited, d)).rejects.toThrow('stale');
    expect((await d.inbox.get(next.id))?.proposal).toEqual(c.proposal);
    expect((await d.inbox.get(next.id))?.receipt).toBeUndefined();
    expect(await d.revisions.count()).toBe(1);
  });
  it('requires acknowledgement of removals', async () => {
    const d = database();
    const { c } = await capture(d);
    c.proposal!.household!.people = [];
    await saveCapture(c, d);
    await expect(applyCapture(c.id, false, d)).rejects.toThrow('acknowledge');
    expect(await d.revisions.count()).toBe(0);
  });
  it('rejects late processing and invalidates a proposal when text changes', async () => {
    const d = database();
    const { c } = await capture(d);
    await d.inbox.update(c.id, { attempt: 'new-attempt' });
    expect(await storeProposal(c.id, c.proposal!, 'old-attempt', d)).toBe(false);
    await updateTranscript(c.id, 'Corrected source', d);
    const updated = await d.inbox.get(c.id);
    expect(updated?.proposal).toBeUndefined();
    expect(updated?.text).toBe('Corrected source');
    expect(updated?.transcript).toBeUndefined();
    expect(updated?.attempt).toBeUndefined();
    expect(await storeProposal(c.id, c.proposal!, 'new-attempt', d)).toBe(false);
  });
  it('creates with app-generated IDs and an idempotent receipt', async () => {
    const d = database();
    await seed(d);
    const c: Capture = {
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
      kind: 'text',
      text: 'New household',
      hints: {},
      stage: 'proposed',
      proposal: manualProposal({ id: 'tmp:h', people: [{ id: 'tmp:p' }], contextIds: [] }),
    };
    await saveCapture(c, d);
    const receipt = await applyCapture(c.id, false, d);
    expect(receipt.householdId).not.toBe('tmp:h');
    expect(await applyCapture(c.id, false, d)).toEqual(receipt);
    expect(await d.households.count()).toBe(4);
  });
});
describe('portable recovery', () => {
  it('uses explicit allowlists, excludes credentials/errors/audio, and marks missing audio', async () => {
    const d = database();
    await seed(d);
    await setMeta('openaiKey', 'TOPSECRET', d);
    const c: Capture = {
      id: uuid(),
      kind: 'audio',
      createdAt: now(),
      updatedAt: now(),
      hints: {},
      stage: 'source-ready',
      audioId: uuid(),
      error: 'PROVIDER_PRIVATE',
      attempt: 'ACTIVE',
    };
    await saveCapture(c, d);
    await d.audio.put({
      id: c.audioId!,
      captureId: c.id,
      chunks: [new Blob(['RAW_AUDIO'])],
      mime: 'audio/mp4',
      complete: true,
    });
    const result = await snapshot(d);
    const json = JSON.stringify(result);
    for (const secret of ['TOPSECRET', 'PROVIDER_PRIVATE', 'RAW_AUDIO', 'ACTIVE', 'audioId'])
      expect(json).not.toContain(secret);
    expect(result.inbox[0].stage).toBe('missing-source');
    expect(result.inbox[0].audioMissing).toBe(true);
  });
  it('rejects newer/malformed files before modifying data', async () => {
    const d = database();
    await seed(d);
    const before = await snapshot(d);
    const newer = { ...before, version: 99 };
    expect(() => parseBackup(JSON.stringify(newer))).toThrow('newer');
    await expect(replaceData(newer, d)).rejects.toThrow();
    const malformed = structuredClone(before);
    malformed.households[0].household.contextIds = ['missing'];
    await expect(replaceData(malformed, d)).rejects.toThrow('context');
    expect(await d.households.count()).toBe(3);
  });
  it('preserves a safety copy and device settings, and atomically recovers it', async () => {
    const d = database();
    await seed(d);
    await setMeta('device-secret', 'NEVER_EXPORT', d);
    await replaceData(fixtures(1), d);
    expect(await d.households.count()).toBe(1);
    expect((await getMeta('importSafety', fixtures(0), d)).households).toHaveLength(3);
    await recoverSafety(d);
    expect(await d.households.count()).toBe(3);
    expect(await getMeta('device-secret', '', d)).toBe('NEVER_EXPORT');
    expect(JSON.stringify(await getMeta('importSafety', {}, d))).not.toContain('NEVER_EXPORT');
  });
  it('rolls back failed replacement including its safety copy', async () => {
    const d = database();
    await seed(d);
    const previous = await getMeta('importSafety', {}, d);
    d.households.hook('creating', () => {
      throw new Error('simulated quota failure');
    });
    await expect(replaceData(fixtures(1), d)).rejects.toThrow();
    expect(await d.households.count()).toBe(3);
    expect(await getMeta('importSafety', {}, d)).toEqual(previous);
  });
});
describe('backup coordinator', () => {
  function providerMock() {
    const storage = new Map<string, string>();
    let saves = 0;
    const provider: BackupProvider = {
      async list() {
        return Promise.all(
          [...storage].map(async ([id, json]) => ({
            id,
            exportedAt: JSON.parse(json).exportedAt,
            bytes: json.length,
            digest: await digest(json),
            version: 1,
          })),
        );
      },
      async save(id, json) {
        saves++;
        storage.set(id, json);
      },
      async load(id) {
        return storage.get(id)!;
      },
      async prune() {},
    };
    return { provider, storage, saves: () => saves };
  }
  it('guards fresh installations until explicitly authorized', async () => {
    const d = database();
    const m = providerMock();
    const coordinator = new BackupCoordinator(m.provider, d);
    await coordinator.run();
    expect(m.saves()).toBe(0);
    await coordinator.authorize();
    expect((await backupState(d)).authoritative).toBe(true);
  });
  it('leaves edits during upload pending and ignores obsolete completions after restore', async () => {
    const d = database();
    const b = await seed(d);
    const m = providerMock();
    const original = m.provider.save;
    m.provider.save = async (id, json, hash) => {
      await original(id, json, hash);
      const r = (await d.households.get(b.households[0].household.id))!;
      await saveHousehold(
        { ...r.household, cue: 'Edited during upload' },
        r.versionId,
        undefined,
        d,
      );
    };
    await new BackupCoordinator(m.provider, d).run();
    let state = await backupState(d);
    expect(state.counter).toBeGreaterThan(state.uploadedCounter);
    m.provider.save = async (id, json, hash) => {
      await original(id, json, hash);
      await replaceData(fixtures(1), d);
    };
    await new BackupCoordinator(m.provider, d).run();
    state = await backupState(d);
    expect(state.uploadedCounter).toBe(0);
    expect(await d.households.count()).toBe(1);
  });
  it('ignores a failed old upload after replacement', async () => {
    const d = database();
    await seed(d);
    const m = providerMock();
    m.provider.save = async () => {
      await replaceData(fixtures(1), d);
      throw new Error('Old request failed');
    };
    await new BackupCoordinator(m.provider, d).run();
    const state = await backupState(d);
    expect(state.error).toBeUndefined();
    expect(state.uploadedCounter).toBe(0);
    expect(await d.households.count()).toBe(1);
  });
  it('reconciles an uncertain upload by stable ID before creating another snapshot', async () => {
    const d = database();
    await seed(d);
    const m = providerMock();
    const original = m.provider.save;
    let first = true;
    m.provider.save = async (id, json, hash) => {
      await original(id, json, hash);
      if (first) {
        first = false;
        throw new Error('lost reply');
      }
    };
    const c = new BackupCoordinator(m.provider, d);
    await expect(c.run()).rejects.toThrow();
    await c.run();
    expect(m.saves()).toBe(1);
    const s = await backupState(d);
    expect(s.counter).toBe(s.uploadedCounter);
    expect(s.pendingSnapshot).toBeUndefined();
  });
});

it('round-trips recognition languages while accepting older backups', async () => {
  const d = database();
  const b = fixtures(1);
  await replaceData(b, d);
  await setMeta('preferences', { resume: false, recognitionLanguages: ['de', 'en'] }, d);
  const exported = await snapshot(d);
  expect(exported.preferences).toEqual({ resume: false, recognitionLanguages: ['de', 'en'] });
  await replaceData(parseBackup(JSON.stringify(exported)), d);
  expect((await snapshot(d)).preferences).toEqual(exported.preferences);
  exported.preferences.recognitionLanguages = [];
  await replaceData(exported, d);
  expect((await snapshot(d)).preferences.recognitionLanguages).toEqual([]);
  exported.preferences.recognitionLanguages = ['invalid'];
  expect(() => parseBackup(JSON.stringify(exported))).toThrow('Invalid recognition language');
});
