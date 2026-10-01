import { afterEach, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { AhThatsWhoDB, db, saveCapture, saveHousehold, backupState } from '../src/data/db';
import {
  applyCapture,
  manualProposal,
  saveDraft,
  updateTranscript,
} from '../src/capture/application';
import { processCapture } from '../src/capture/process';
import * as api from '../src/providers/openai';
import { snapshot, replaceData, importPreview } from '../src/backup/portable';
import { fixtures } from '../src/domain/fixtures';
import { captureDrafts, now, uuid, type Capture } from '../src/domain/types';
const databases: AhThatsWhoDB[] = [];
function database() {
  const d = new AhThatsWhoDB(uuid());
  databases.push(d);
  return d;
}
function capture(): Capture {
  return {
    id: uuid(),
    kind: 'text',
    text: 'Avery from pottery. Elena has a red bicycle.',
    createdAt: now(),
    updatedAt: now(),
    hints: {},
    stage: 'proposed',
    proposals: [],
  };
}
const fresh = () => ({
  ...manualProposal({
    id: 'tmp:avery',
    people: [{ id: 'tmp:p', firstName: { value: 'Avery' } }],
    contextIds: [],
  }),
  sourceQuotes: ['Avery from pottery.'],
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map((d) => d.delete()));
  await db.delete();
});

it('saves mixed creates and updates once, with receipts for every household', async () => {
  const d = database(),
    b = fixtures(1),
    c = capture();
  await replaceData(b, d);
  c.proposals = [
    fresh(),
    manualProposal({ ...b.households[0].household, cue: 'Red bicycle' }, b.households[0]),
  ];
  await saveCapture(c, d);
  const saved = await applyCapture(c.id, true, d);
  expect(saved).toHaveLength(2);
  expect(await applyCapture(c.id, true, d)).toEqual(saved);
  expect(await d.households.count()).toBe(2);
  expect(await d.revisions.count()).toBe(1);
  expect((await d.households.get(saved[1].householdId))?.household.cue).toBe('Red bicycle');
  expect(saved[0].householdId).not.toMatch(/^tmp:/);
  const restored = database();
  const exported = importPreview(JSON.stringify(await snapshot(d)));
  expect(exported.version).toBe(2);
  await replaceData(exported, restored);
  expect(await applyCapture(c.id, true, restored)).toEqual(saved);
  expect(await restored.households.count()).toBe(2);
});

it('rolls back the entire save when a later draft is stale', async () => {
  const d = database(),
    b = fixtures(1),
    c = capture();
  await replaceData(b, d);
  const r = b.households[0];
  c.proposals = [fresh(), manualProposal({ ...r.household, cue: 'Red bicycle' }, r)];
  await saveCapture(c, d);
  await saveHousehold({ ...r.household, cue: 'A newer edit' }, r.versionId, undefined, d);
  const before = await snapshot(d),
    state = await backupState(d);
  await expect(applyCapture(c.id, true, d)).rejects.toThrow('stale');
  const after = await snapshot(d);
  expect(after.households).toEqual(before.households);
  expect(after.revisions).toEqual(before.revisions);
  expect(after.inbox).toEqual(before.inbox);
  expect(await backupState(d)).toEqual(state);
});

it('does not apply two snapshots for the same target or a set with an unresolved target', async () => {
  const d = database(),
    b = fixtures(1),
    c = capture();
  await replaceData(b, d);
  const p = manualProposal(b.households[0].household, b.households[0]);
  c.proposals = [p, p];
  await saveCapture(c, d);
  await expect(applyCapture(c.id, true, d)).rejects.toThrow('same household');
  c.proposals = [fresh(), { ...p, action: 'ambiguous' }];
  await saveCapture(c, d);
  await expect(applyCapture(c.id, true, d)).rejects.toThrow('every draft');
  expect(await d.households.count()).toBe(1);
});

it('keeps manual changes in one draft without applying any household', async () => {
  const d = database(),
    c = capture();
  c.proposals = [fresh(), { ...fresh(), sourceQuotes: ['Elena has a red bicycle.'] }];
  await saveCapture(c, d);
  const changed = { ...fresh(), household: { ...fresh().household!, cue: 'Yellow scarf' } };
  await saveDraft(c.id, 0, changed, c.proposals[0], d);
  expect(await d.households.count()).toBe(0);
  const drafts = captureDrafts((await d.inbox.get(c.id))!);
  expect(drafts[0].household?.cue).toBe('Yellow scarf');
  expect(drafts[0].edited).toBe(true);
  expect(drafts[1]).toEqual(c.proposals[1]);
  await expect(saveDraft(c.id, 0, fresh(), c.proposals[0], d)).rejects.toThrow('changed');
});

it('reprocesses just the selected source excerpts as new and keeps all drafts on failure', async () => {
  await db.open();
  const c = capture();
  c.proposals = [
    fresh(),
    { ...fresh(), action: 'ambiguous', sourceQuotes: ['Elena has a red bicycle.'] },
  ];
  await saveCapture(c);
  const generate = vi
    .spyOn(api, 'generate')
    .mockRejectedValueOnce(new Error('Network unavailable'));
  await expect(processCapture(c.id, 'new', 1)).rejects.toThrow('Network unavailable');
  expect(captureDrafts((await db.inbox.get(c.id))!)).toEqual(c.proposals);
  const args = generate.mock.calls[0];
  expect(args[0].text).toBe('Elena has a red bicycle.');
  expect(args[4]).toBe('new');
  generate.mockResolvedValueOnce([fresh()]);
  await processCapture(c.id, 'new', 1);
  const drafts = captureDrafts((await db.inbox.get(c.id))!);
  expect(drafts[0]).toEqual(c.proposals[0]);
  expect(drafts[1].action).toBe('create');
  expect(drafts[1].sourceQuotes).toEqual(c.proposals[1].sourceQuotes);
});

it('retains previous drafts after source correction but blocks saving until refreshed', async () => {
  await db.open();
  const c = capture();
  c.proposals = [fresh()];
  await saveCapture(c);
  await updateTranscript(c.id, 'Corrected note');
  const generate = vi.spyOn(api, 'generate').mockRejectedValueOnce(new Error('Offline'));
  await expect(processCapture(c.id, 'multiple')).rejects.toThrow('Offline');
  expect(generate.mock.calls[0][0].text).toBe('Corrected note');
  expect(captureDrafts((await db.inbox.get(c.id))!)).toEqual(c.proposals);
  await expect(applyCapture(c.id)).rejects.toThrow('current source');
  const restored = database();
  await replaceData(importPreview(JSON.stringify(await snapshot())), restored);
  await expect(applyCapture(c.id, true, restored)).rejects.toThrow('current source');
});

it('opens a version 1 local database and imports singular captures without losing them', async () => {
  const name = uuid();
  const old = new Dexie(name);
  old
    .version(1)
    .stores({
      households: 'household.id,updatedAt,deletedAt',
      contexts: 'id',
      revisions: 'id,record.household.id',
      inbox: 'id,createdAt,stage',
      audio: 'id,captureId',
      meta: 'key',
    });
  const c = capture();
  delete c.proposals;
  c.proposal = fresh();
  await old.table('inbox').put(c);
  old.close();
  const upgraded = new AhThatsWhoDB(name);
  databases.push(upgraded);
  expect(captureDrafts((await upgraded.inbox.get(c.id))!)).toEqual([c.proposal]);
  const b = fixtures(0);
  b.version = 1;
  b.inbox = [c];
  const clean = importPreview(JSON.stringify(b));
  expect(clean.version).toBe(2);
  expect(clean.inbox[0].proposals).toHaveLength(1);
  expect(clean.inbox[0].proposal).toBeUndefined();
  await replaceData(clean, upgraded);
  expect(await applyCapture(c.id, true, upgraded)).toHaveLength(1);
});
