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
  captureDrafts,
  captureReceipts,
  type CaptureReceipt,
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
    if (p.imageAssetId && p.imageAssetId !== n.imageAssetId)
      changes.push(`Image for ${personName(p)}: ${n.imageAssetId ? 'replaced' : 'removed'}`);
  }
  for (const k of ['cue', 'notes'] as const)
    if (current[k] && current[k] !== proposed[k])
      changes.push(`Change ${k}: ${current[k]} → ${proposed[k] || 'removed'}`);
  for (const c of current.contextIds)
    if (!proposed.contextIds.includes(c)) changes.push(`Remove context reference: ${c}`);
  return changes;
}
export async function applyCapture(id: string, acknowledged = false, d: AhThatsWhoDB = db) {
  const receipts = await d.transaction(
    'rw',
    [d.inbox, d.households, d.contexts, d.revisions, d.meta],
    async () => {
      const c = await d.inbox.get(id);
      assert(c, 'Capture not found');
      if (captureReceipts(c).length) return captureReceipts(c);
      assert(!c.attempt && !c.sourceChanged, 'Finish processing the current source before saving');
      const drafts = captureDrafts(c);
      assert(c.stage === 'proposed' && drafts.length, 'This capture is not ready to apply');
      const targets = drafts.filter((p) => p.action === 'update').map((p) => p.targetId);
      assert(
        new Set(targets).size === targets.length,
        'Several drafts update the same household. Reprocess this capture.',
      );
      const receipts: CaptureReceipt[] = [];
      for (const p of drafts) {
        assert(
          !p.contextSuggestions.length,
          'This older proposal suggests new contexts. Create them in Settings if wanted, then reprocess the capture.',
        );
        assert(
          p.action === 'update' || p.action === 'create',
          'Choose a household for every draft first',
        );
        assert(p.household, 'Proposal has no household');
        const h = structuredClone(p.household);
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
          h.people = h.people.map((x) =>
            current.household.people.some((old) => old.id === x.id) ? x : { ...x, id: uuid() },
          );
        } else {
          h.id = uuid();
          h.people = h.people.map((x) => ({ ...x, id: uuid() }));
        }
        validateHousehold(h, new Set((await d.contexts.toArray()).map((c) => c.id)));
        const r = await writeHousehold(
          h,
          p.action === 'update' ? p.baseVersion : undefined,
          { kind: p.model ? 'llm' : 'manual', captureId: id, sourceRef: c.sourceRef },
          d,
        );
        receipts.push({ householdId: r.household.id, versionId: r.versionId, appliedAt: now() });
      }
      c.receipts = receipts;
      delete c.receipt;
      c.stage = 'applied';
      c.updatedAt = now();
      delete c.attempt;
      delete c.error;
      await d.inbox.put(c);
      await dirty(d);
      return receipts;
    },
  );
  await cleanupAudio(id, d).catch(() => {
    /* Startup retries cleanup after the committed save. */
  });
  return receipts;
}

// Editing changes only the draft. The review screen applies the complete capture.
export async function saveDraft(
  id: string,
  index: number,
  proposal: Proposal,
  expected: Proposal | undefined,
  d = db,
) {
  return d.transaction('rw', [d.inbox, d.meta], async () => {
    const c = await d.inbox.get(id);
    assert(c && !['applied', 'discarded'].includes(c.stage), 'Capture already completed');
    assert(
      !c.attempt && !c.sourceChanged,
      'Finish processing the current source before editing drafts',
    );
    const drafts = captureDrafts(c);
    assert(
      JSON.stringify(drafts[index]) === JSON.stringify(expected),
      'This draft changed. Reopen it before editing.',
    );
    assert(index >= 0 && index <= drafts.length, 'Draft no longer exists');
    drafts[index] = {
      ...proposal,
      sourceQuotes: expected?.sourceQuotes,
      edited: true,
      generatedAt: now(),
    };
    await storeProposals(id, drafts, undefined, d);
  });
}

export async function discardCapture(id: string, d = db) {
  await d.transaction('rw', [d.inbox, d.meta], async () => {
    const c = await d.inbox.get(id);
    assert(c && !captureReceipts(c).length, 'Capture cannot be discarded');
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
    c.sourceChanged = captureDrafts(c).length > 0;
    delete c.attempt;
    delete c.error;
    await d.inbox.put(c);
    await dirty(d);
  });
}
export async function storeProposals(
  id: string,
  drafts: Proposal[],
  attempt?: string,
  d = db,
  replaceIndex?: number,
) {
  return d.transaction('rw', [d.inbox, d.meta], async () => {
    const c = await d.inbox.get(id);
    assert(c && !['applied', 'discarded'].includes(c.stage), 'Capture is already completed');
    if (attempt && c.attempt !== attempt) return false;
    if (replaceIndex !== undefined) {
      const previous = captureDrafts(c);
      assert(previous[replaceIndex] && drafts.length === 1, 'Draft no longer exists');
      previous[replaceIndex] = { ...drafts[0], sourceQuotes: previous[replaceIndex].sourceQuotes };
      drafts = previous;
    }
    c.proposals = drafts;
    delete c.proposal;
    delete c.sourceChanged;
    c.stage = drafts.some((p) => p.action === 'ambiguous' || p.action === 'multiple')
      ? 'needs-target'
      : 'proposed';
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
