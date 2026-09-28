import {
  FORMAT_VERSION,
  now,
  uuid,
  type Backup,
  type Capture,
  type Household,
  type HouseholdRecord,
  type Proposal,
  type Value,
} from '../domain/types';
import { parseBackup, validateBackup } from '../domain/integrity';
import { db, getMeta, setMeta, backupState, type NameCueDB } from '../data/db';
const val = <T>(v: Value<T> | undefined): Value<T> | undefined =>
  v
    ? {
        value: typeof v.value === 'object' ? (dateValue(v.value) as T) : v.value,
        ...(v.certainty ? { certainty: v.certainty } : {}),
      }
    : undefined;
function dateValue(v: unknown) {
  const d = v as Record<string, unknown>;
  return {
    kind: d.kind,
    ...(d.kind !== 'month-day' ? { year: d.year } : {}),
    ...(d.kind !== 'year' ? { month: d.month } : {}),
    ...(['month-day', 'date'].includes(String(d.kind)) ? { day: d.day } : {}),
  };
}
export const cleanHousehold = (h: Household): Household => ({
  id: h.id,
  contextIds: [...h.contextIds],
  cue: h.cue,
  notes: h.notes,
  people: h.people.map((p) => ({
    id: p.id,
    firstName: val(p.firstName),
    lastName: val(p.lastName),
    role: p.role,
    birthDate: val(p.birthDate),
    ageNote: val(p.ageNote),
    notes: p.notes,
  })),
});
const cleanRecord = (r: HouseholdRecord): HouseholdRecord => ({
  household: cleanHousehold(r.household),
  versionId: r.versionId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  deletedAt: r.deletedAt,
  source: { kind: r.source.kind, captureId: r.source.captureId, sourceRef: r.source.sourceRef },
});
export const cleanProposal = (p: Proposal): Proposal => ({
  action: p.action,
  household: p.household && cleanHousehold(p.household),
  targetId: p.targetId,
  baseVersion: p.baseVersion,
  candidateIds: [...p.candidateIds],
  contextSuggestions: p.contextSuggestions.map((c) => ({
    id: c.id,
    name: c.name,
    favorite: c.favorite,
  })),
  reason: p.reason,
  model: p.model,
  generatedAt: p.generatedAt,
  removals: [...p.removals],
});
export function cleanCapture(c: Capture): Capture {
  const missing =
    c.kind === 'audio' && !c.transcript && !c.text && !['applied', 'discarded'].includes(c.stage);
  return {
    id: c.id,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    kind: c.kind,
    text: c.text,
    transcript: c.transcript,
    hints: { householdId: c.hints.householdId, contextId: c.hints.contextId },
    stage: missing ? 'missing-source' : c.stage,
    audioMissing: c.kind === 'audio' ? true : undefined,
    proposal: c.proposal && cleanProposal(c.proposal),
    receipt: c.receipt
      ? {
          householdId: c.receipt.householdId,
          versionId: c.receipt.versionId,
          appliedAt: c.receipt.appliedAt,
        }
      : undefined,
    sourceRef: c.sourceRef,
  };
}
export function sanitize(b: Backup): Backup {
  return {
    format: 'namecue',
    version: FORMAT_VERSION,
    exportedAt: b.exportedAt,
    contexts: b.contexts.map((c) => ({ id: c.id, name: c.name, favorite: c.favorite })),
    households: b.households.map(cleanRecord),
    revisions: b.revisions.map((r) => ({
      id: r.id,
      record: cleanRecord(r.record),
      archivedAt: r.archivedAt,
      contextNames: { ...r.contextNames },
    })),
    inbox: b.inbox.map(cleanCapture),
    preferences: {
      resume: b.preferences.resume,
      ...(b.preferences.recognitionLanguages !== undefined
        ? { recognitionLanguages: [...b.preferences.recognitionLanguages] }
        : {}),
    },
  };
}
export async function snapshot(d = db): Promise<Backup> {
  return d.transaction('r', [d.contexts, d.households, d.revisions, d.inbox, d.meta], async () =>
    sanitize({
      format: 'namecue',
      version: FORMAT_VERSION,
      exportedAt: now(),
      contexts: await d.contexts.toArray(),
      households: await d.households.toArray(),
      revisions: await d.revisions.toArray(),
      inbox: await d.inbox.toArray(),
      preferences: await getMeta('preferences', { resume: true }, d),
    }),
  );
}
export const digest = async (json: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
export function importPreview(json: string) {
  return sanitize(parseBackup(json));
}
export async function replaceData(input: Backup, d: NameCueDB = db) {
  validateBackup(input);
  const b = sanitize(input);
  return d.transaction(
    'rw',
    [d.households, d.contexts, d.revisions, d.inbox, d.audio, d.meta],
    async () => {
      const safety = await snapshot(d);
      await setMeta('importSafety', safety, d);
      const previous = await backupState(d);
      for (const t of [d.households, d.contexts, d.revisions, d.inbox, d.audio]) await t.clear();
      await d.contexts.bulkPut(b.contexts);
      await d.households.bulkPut(b.households);
      await d.revisions.bulkPut(b.revisions);
      for (const c of b.inbox) {
        if (c.proposal?.action === 'update') {
          const r = b.households.find((r) => r.household.id === c.proposal?.targetId);
          if (!r || r.deletedAt || r.versionId !== c.proposal.baseVersion) {
            delete c.proposal;
            c.stage = c.transcript
              ? 'transcript-ready'
              : c.text
                ? 'source-ready'
                : 'missing-source';
          }
        }
      }
      await d.inbox.bulkPut(b.inbox);
      await setMeta('preferences', b.preferences, d);
      await setMeta(
        'backup',
        {
          counter: previous.counter + 1,
          uploadedCounter: 0,
          generation: uuid(),
          authoritative: true,
        },
        d,
      );
      await d.meta.where('key').startsWith('draft:').delete();
      await d.meta.where('key').startsWith('migration:').delete();
      await d.meta.delete('ui');
    },
  );
}
export async function recoverSafety(d = db) {
  const safety = await getMeta<Backup | undefined>('importSafety', undefined, d);
  if (!safety) throw new Error('No previous local data is available');
  await replaceData(safety, d);
}
export function download(json: string, name = `namecue-${now().slice(0, 10)}.json`) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
