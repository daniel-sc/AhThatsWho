import { recognitionLanguages } from './languages';
import { FORMAT_VERSION, type Backup, type Household, type BirthDate } from './types';
export function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function object(x: unknown): asserts x is Record<string, unknown> {
  assert(x && typeof x === 'object' && !Array.isArray(x), 'Expected an object');
}
export function string(x: unknown, max = 20000): asserts x is string {
  assert(typeof x === 'string' && x.length <= max, 'Invalid or excessively long text');
}
export function id(x: unknown): asserts x is string {
  string(x, 128);
  assert(x.length > 0 && /^[a-zA-Z0-9_.:-]+$/.test(x), 'Invalid ID');
}
function array(x: unknown, max = 100000): asserts x is unknown[] {
  assert(Array.isArray(x) && x.length <= max, 'Invalid or excessively large list');
}
function unique(xs: string[]) {
  assert(new Set(xs).size === xs.length, 'Duplicate IDs');
}
function timestamp(x: unknown) {
  string(x, 40);
  assert(Number.isFinite(Date.parse(x)), 'Invalid timestamp');
}
export function validDate(d: unknown): asserts d is BirthDate {
  object(d);
  assert(
    ['year', 'year-month', 'date', 'month-day'].includes(String(d.kind)),
    'Invalid date precision',
  );
  if (d.kind !== 'month-day')
    assert(
      Number.isInteger(d.year) && Number(d.year) >= 1 && Number(d.year) <= 9999,
      'Invalid year',
    );
  if (d.kind !== 'year')
    assert(
      Number.isInteger(d.month) && Number(d.month) >= 1 && Number(d.month) <= 12,
      'Invalid month',
    );
  if (d.kind === 'date' || d.kind === 'month-day') {
    const y = d.kind === 'date' ? Number(d.year) : 2000;
    const max = new Date(Date.UTC(y, Number(d.month), 0)).getUTCDate();
    assert(
      Number.isInteger(d.day) && Number(d.day) >= 1 && Number(d.day) <= max,
      'Invalid calendar day',
    );
  }
}
function value(v: unknown, date = false) {
  object(v);
  assert(
    v.certainty === undefined || ['uncertain', 'approximate'].includes(String(v.certainty)),
    'Invalid certainty',
  );
  if (date) validDate(v.value);
  else string(v.value, 2000);
}
export function validateHousehold(h: unknown, contexts: Set<string>): asserts h is Household {
  object(h);
  id(h.id);
  array(h.people, 100);
  array(h.contextIds, 100);
  h.contextIds.forEach(id);
  unique(h.contextIds as string[]);
  assert(
    h.contextIds.every((c) => contexts.has(String(c))),
    'Unknown context reference',
  );
  const ids: string[] = [];
  for (const p of h.people) {
    object(p);
    id(p.id);
    ids.push(p.id);
    for (const k of ['firstName', 'lastName', 'ageNote']) if (p[k] !== undefined) value(p[k]);
    if (p.birthDate !== undefined) value(p.birthDate, true);
    assert(
      p.role === undefined || ['adult', 'child', 'other'].includes(String(p.role)),
      'Invalid person role',
    );
    if (p.notes !== undefined) string(p.notes);
  }
  unique(ids);
  for (const k of ['cue', 'notes']) if (h[k] !== undefined) string(h[k]);
  assert(
    h.people.length || String(h.cue || '').trim() || String(h.notes || '').trim(),
    'Add a person, a cue, or a note before saving',
  );
}
function record(r: unknown, contexts: Set<string>) {
  object(r);
  validateHousehold(r.household, contexts);
  id(r.versionId);
  timestamp(r.createdAt);
  timestamp(r.updatedAt);
  if (r.deletedAt !== undefined) timestamp(r.deletedAt);
  object(r.source);
  assert(
    ['manual', 'llm', 'restore', 'import'].includes(String(r.source.kind)),
    'Invalid provenance',
  );
  for (const k of ['captureId', 'sourceRef'])
    if (r.source[k] !== undefined) string(r.source[k], 300);
}
export function validateBackup(input: unknown): asserts input is Backup {
  object(input);
  assert(input.format === 'ahthatswho', 'Not an AhThatsWho backup');
  assert(
    input.version === FORMAT_VERSION,
    Number(input.version) > FORMAT_VERSION
      ? 'This backup requires a newer AhThatsWho version'
      : 'Unsupported backup version',
  );
  timestamp(input.exportedAt);
  for (const k of ['contexts', 'households', 'revisions', 'inbox']) array(input[k]);
  const contexts = input.contexts as Record<string, unknown>[];
  for (const c of contexts) {
    object(c);
    id(c.id);
    string(c.name, 200);
    assert(c.name.trim(), 'Context needs a name');
    assert(typeof c.favorite === 'boolean', 'Invalid favorite flag');
  }
  unique(contexts.map((c) => String(c.id)));
  const contextIds = new Set(contexts.map((c) => String(c.id)));
  const households = input.households as Record<string, unknown>[];
  households.forEach((r) => record(r, contextIds));
  unique(households.map((r) => (r.household as Household).id));
  unique(households.flatMap((r) => (r.household as Household).people.map((p) => p.id)));
  const householdIds = new Set(households.map((r) => (r.household as Household).id));
  const revisions = input.revisions as Record<string, unknown>[];
  for (const r of revisions) {
    object(r);
    id(r.id);
    timestamp(r.archivedAt);
    object(r.contextNames);
    for (const [k, v] of Object.entries(r.contextNames)) {
      id(k);
      string(v, 200);
    }
    record(r.record, new Set(Object.keys(r.contextNames)));
    assert(
      householdIds.has((r.record as { household: Household }).household.id),
      'Revision has no current household',
    );
  }
  unique(revisions.map((r) => String(r.id)));
  const inbox = input.inbox as Record<string, unknown>[];
  for (const c of inbox) {
    object(c);
    id(c.id);
    timestamp(c.createdAt);
    timestamp(c.updatedAt);
    assert(c.kind === 'text' || c.kind === 'audio', 'Invalid capture kind');
    assert(
      [
        'source-ready',
        'transcript-ready',
        'needs-target',
        'proposed',
        'applied',
        'discarded',
        'missing-source',
      ].includes(String(c.stage)),
      'Invalid inbox stage',
    );
    object(c.hints);
    for (const k of ['householdId', 'contextId']) if (c.hints[k] !== undefined) id(c.hints[k]);
    for (const k of ['text', 'transcript']) if (c[k] !== undefined) string(c[k]);
    if (c.sourceRef !== undefined) string(c.sourceRef, 300);
    if (c.proposal !== undefined) {
      const p = c.proposal;
      object(p);
      assert(
        ['create', 'update', 'ambiguous', 'multiple'].includes(String(p.action)),
        'Invalid proposal action',
      );
      array(p.candidateIds, 100);
      p.candidateIds.forEach(id);
      array(p.contextSuggestions, 100);
      const ids = new Set(contextIds);
      for (const s of p.contextSuggestions) {
        object(s);
        id(s.id);
        string(s.name, 200);
        assert(typeof s.favorite === 'boolean', 'Invalid context suggestion');
        ids.add(s.id);
      }
      if (p.household !== undefined) validateHousehold(p.household, ids);
      if (p.targetId !== undefined) id(p.targetId);
      if (p.baseVersion !== undefined) id(p.baseVersion);
      string(p.reason);
      timestamp(p.generatedAt);
      array(p.removals, 1000);
      p.removals.forEach((x) => string(x));
      if (p.model !== undefined) string(p.model, 200);
      assert(
        !['create', 'update'].includes(String(p.action)) || p.household,
        'Proposal has no household',
      );
      assert(
        p.action !== 'update' ||
          (p.targetId && p.baseVersion && (p.household as Household)?.id === p.targetId),
        'Invalid update proposal',
      );
    }
    if (c.receipt !== undefined) {
      object(c.receipt);
      id(c.receipt.householdId);
      id(c.receipt.versionId);
      timestamp(c.receipt.appliedAt);
    }
    assert(c.stage !== 'applied' || c.receipt, 'Applied capture has no receipt');
    assert(c.stage !== 'proposed' || c.proposal, 'Missing proposal');
  }
  unique(inbox.map((c) => String(c.id)));
  object(input.preferences);
  assert(typeof input.preferences.resume === 'boolean', 'Invalid preferences');
  if (input.preferences.recognitionLanguages !== undefined) {
    array(input.preferences.recognitionLanguages, recognitionLanguages.length);
    assert(
      input.preferences.recognitionLanguages.every((code) =>
        recognitionLanguages.some((language) => language.code === code),
      ),
      'Invalid recognition language',
    );
    unique(input.preferences.recognitionLanguages as string[]);
  }
}
export function semantic(h: Household) {
  return JSON.stringify({
    id: h.id,
    people: h.people.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      role: p.role,
      birthDate: p.birthDate,
      ageNote: p.ageNote,
      notes: p.notes?.trim() || undefined,
    })),
    contextIds: [...h.contextIds].sort(),
    cue: h.cue?.trim() || undefined,
    notes: h.notes?.trim() || undefined,
  });
}
export function parseBackup(json: string): Backup {
  assert(new TextEncoder().encode(json).length <= 50 * 1024 * 1024, 'Backup exceeds 50 MB');
  const data: unknown = JSON.parse(json);
  validateBackup(data);
  return data;
}
