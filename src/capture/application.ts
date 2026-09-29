import { db, dirty, writeHousehold, type AhThatsWhoDB } from '../data/db';
import { assert, validateHousehold } from '../domain/integrity';
import {
  now,
  uuid,
  personName,
  dateText,
  type Capture,
  type Household,
  type HouseholdRecord,
  type Proposal,
} from '../domain/types';
function factText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    const v = value as { value: unknown; certainty?: string };
    return factText(v.value) + (v.certainty ? ` (${v.certainty})` : '');
  }
  if (value && typeof value === 'object' && 'kind' in value)
    return dateText(value as import('../domain/types').BirthDate);
  return 'removed';
}
const labels = {
  firstName: 'First name',
  lastName: 'Last name',
  role: 'Role',
  birthDate: 'Date',
  ageNote: 'Age / date wording',
  notes: 'Notes',
};
export function removals(current: Household, proposed: Household) {
  const changes: string[] = [];
  for (const p of current.people) {
    const n = proposed.people.find((x) => x.id === p.id);
    if (!n) {
      changes.push(`Remove person: ${personName(p)}`);
      continue;
    }
    for (const k of ['firstName', 'lastName', 'role', 'birthDate', 'ageNote', 'notes'] as const)
      if (p[k] && JSON.stringify(p[k]) !== JSON.stringify(n[k]))
        changes.push(`${labels[k]} for ${personName(p)}: ${factText(p[k])} → ${factText(n[k])}`);
  }
  for (const k of ['cue', 'notes'] as const)
    if (current[k] && current[k] !== proposed[k])
      changes.push(`Change ${k}: ${current[k]} → ${proposed[k] || 'removed'}`);
  for (const c of current.contextIds)
    if (!proposed.contextIds.includes(c)) changes.push(`Remove context reference: ${c}`);
  return changes;
}
export async function applyCapture(id: string, acknowledged = false, d: AhThatsWhoDB = db) {
  const receipt = await d.transaction(
    'rw',
    [d.inbox, d.households, d.contexts, d.revisions, d.meta],
    async () => {
      const c = await d.inbox.get(id);
      assert(c, 'Capture not found');
      if (c.receipt) return c.receipt;
      assert(c.stage === 'proposed' && c.proposal, 'This capture is not ready to apply');
      const p = c.proposal;
      assert(p.action === 'update' || p.action === 'create', 'Choose one household first');
      assert(p.household, 'Proposal has no household');
      let h = structuredClone(p.household);
      if (p.action === 'update') {
        const current = await d.households.get(p.targetId!);
        assert(current && !current.deletedAt, 'The target was removed. Choose another target.');
        assert(
          current.versionId === p.baseVersion,
          'This proposal is stale: the household changed. Regenerate or review current data.',
        );
        assert(h.id === current.household.id, 'Target ID mismatch');
        assert(
          !removals(current.household, h).length || acknowledged,
          'Review and acknowledge the changed or removed facts',
        );
      } else {
        h.id = uuid();
        const ids = new Map(h.people.map((x) => [x.id, uuid()]));
        h.people = h.people.map((x) => ({ ...x, id: ids.get(x.id)! }));
      }
      const mapping = new Map<string, string>();
      for (const suggestion of p.contextSuggestions) {
        const existing = (await d.contexts.toArray()).find(
          (x) => x.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase(),
        );
        const next = existing || { ...suggestion, id: uuid() };
        if (!existing) await d.contexts.add(next);
        mapping.set(suggestion.id, next.id);
      }
      h.contextIds = [...new Set(h.contextIds.map((x) => mapping.get(x) || x))];
      if (p.action === 'update') {
        const current = await d.households.get(h.id);
        h.people = h.people.map((x) =>
          current!.household.people.some((old) => old.id === x.id) ? x : { ...x, id: uuid() },
        );
      }
      validateHousehold(h, new Set((await d.contexts.toArray()).map((x) => x.id)));
      const r = await writeHousehold(
        h,
        p.action === 'update' ? p.baseVersion : undefined,
        { kind: p.model ? 'llm' : 'manual', captureId: id, sourceRef: c.sourceRef },
        d,
      );
      c.receipt = { householdId: r.household.id, versionId: r.versionId, appliedAt: now() };
      c.stage = 'applied';
      c.updatedAt = now();
      delete c.attempt;
      delete c.error;
      await d.inbox.put(c);
      await dirty(d);
      return c.receipt;
    },
  );
  await cleanupAudio(id, d).catch(() => {
    /* Receipt is committed; startup retries cleanup. */
  });
  return receipt;
}
// Keep the edited proposal and its application together: a stale save leaves both untouched.
export async function saveAndApplyCapture(id: string, proposal: Proposal, d = db) {
  return d.transaction(
    'rw',
    [d.inbox, d.households, d.contexts, d.revisions, d.meta, d.audio],
    async () => {
      const capture = await d.inbox.get(id);
      if (capture?.receipt) return capture.receipt;
      await storeProposal(id, proposal, undefined, d);
      return applyCapture(id, true, d);
    },
  );
}

export async function discardCapture(id: string, d = db) {
  await d.transaction('rw', [d.inbox, d.meta], async () => {
    const c = await d.inbox.get(id);
    assert(c && !c.receipt, 'Capture cannot be discarded');
    c.stage = 'discarded';
    delete c.attempt;
    c.updatedAt = now();
    await d.inbox.put(c);
    await dirty(d);
  });
  await cleanupAudio(id, d).catch(() => {
    /* Receipt is committed; startup retries cleanup. */
  });
}
export async function updateTranscript(id: string, text: string, d = db) {
  assert(text.trim(), 'Enter source text');
  await d.transaction('rw', [d.inbox, d.meta], async () => {
    const c = await d.inbox.get(id);
    assert(c && !['applied', 'discarded'].includes(c.stage), 'Capture is already completed');
    if (c.kind === 'text') {
      c.text = text.trim();
      delete c.transcript;
    } else c.transcript = text.trim();
    c.stage = 'transcript-ready';
    c.updatedAt = now();
    delete c.proposal;
    delete c.attempt;
    delete c.error;
    await d.inbox.put(c);
    await dirty(d);
  });
}
export async function storeProposal(id: string, p: Proposal, attempt?: string, d = db) {
  return d.transaction('rw', [d.inbox, d.meta], async () => {
    const c = await d.inbox.get(id);
    assert(c && !['applied', 'discarded'].includes(c.stage), 'Capture already completed');
    if (attempt && c.attempt !== attempt) return false;
    c.proposal = p;
    c.stage = p.action === 'ambiguous' || p.action === 'multiple' ? 'needs-target' : 'proposed';
    delete c.attempt;
    delete c.error;
    c.updatedAt = now();
    await d.inbox.put(c);
    await dirty(d);
    return true;
  });
}
export function manualProposal(h: Household, current?: HouseholdRecord): Proposal {
  return {
    action: current ? 'update' : 'create',
    household: h,
    targetId: current?.household.id,
    baseVersion: current?.versionId,
    candidateIds: [],
    contextSuggestions: [],
    reason: 'Manually reviewed proposal',
    generatedAt: now(),
    removals: current ? removals(current.household, h) : [],
  };
}

async function cleanupAudio(id: string, d: AhThatsWhoDB) {
  await d.transaction('rw', [d.audio, d.inbox], async () => {
    await d.audio.where('captureId').equals(id).delete();
    await d.inbox.update(id, { audioId: undefined });
  });
}
