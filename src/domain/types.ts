export const FORMAT_VERSION = 1;
export type Value<T = string> = { value: T; certainty?: 'uncertain' | 'approximate' };
export type BirthDate =
  | { kind: 'year'; year: number }
  | { kind: 'year-month'; year: number; month: number }
  | { kind: 'date'; year: number; month: number; day: number }
  | { kind: 'month-day'; month: number; day: number };
export interface Person {
  id: string;
  firstName?: Value;
  lastName?: Value;
  role?: 'adult' | 'child' | 'other';
  birthDate?: Value<BirthDate>;
  ageNote?: Value;
  notes?: string;
}
export interface Household {
  id: string;
  people: Person[];
  contextIds: string[];
  cue?: string;
  notes?: string;
}
export interface Context {
  id: string;
  name: string;
  favorite: boolean;
}
export interface Provenance {
  kind: 'manual' | 'llm' | 'restore' | 'import';
  captureId?: string;
  sourceRef?: string;
}
export interface HouseholdRecord {
  household: Household;
  versionId: string;
  createdAt: string;
  updatedAt: string;
  lastViewedAt?: string;
  deletedAt?: string;
  source: Provenance;
}
export interface Revision {
  id: string;
  record: HouseholdRecord;
  archivedAt: string;
  contextNames: Record<string, string>;
}
export type Stage =
  | 'source-ready'
  | 'transcript-ready'
  | 'needs-target'
  | 'proposed'
  | 'applied'
  | 'discarded'
  | 'missing-source';
export interface Proposal {
  action: 'create' | 'update' | 'ambiguous' | 'multiple';
  household?: Household;
  targetId?: string;
  baseVersion?: string;
  candidateIds: string[];
  contextSuggestions: Context[];
  reason: string;
  model?: string;
  generatedAt: string;
  removals: string[];
}
export interface Capture {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: 'text' | 'audio';
  text?: string;
  transcript?: string;
  audioId?: string;
  audioMissing?: boolean;
  audioIncomplete?: boolean;
  hints: { householdId?: string; contextId?: string };
  stage: Stage;
  error?: string;
  attempt?: string;
  proposal?: Proposal;
  receipt?: { householdId: string; versionId: string; appliedAt: string };
  sourceRef?: string;
}
export interface AudioRecord {
  id: string;
  captureId: string;
  chunks: Blob[];
  mime: string;
  complete: boolean;
}
export interface Preferences {
  resume: boolean;
  recognitionLanguages?: string[];
}
export interface Backup {
  format: 'namecue';
  version: number;
  exportedAt: string;
  contexts: Context[];
  households: HouseholdRecord[];
  revisions: Revision[];
  inbox: Capture[];
  preferences: Preferences;
}
export interface BackupState {
  counter: number;
  uploadedCounter: number;
  generation: string;
  authoritative: boolean;
  lastSuccess?: string;
  pendingSnapshot?: {
    id: string;
    counter: number;
    generation: string;
    json: string;
    digest: string;
  };
  error?: string;
}
export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const emptyHousehold = (): Household => ({ id: uuid(), people: [], contextIds: [] });
export const personName = (p: Person) =>
  [p.firstName?.value, p.lastName?.value].filter(Boolean).join(' ') || 'Unknown name';
export const dateText = (d: BirthDate) =>
  d.kind === 'year'
    ? String(d.year)
    : d.kind === 'year-month'
      ? `${d.year}-${String(d.month).padStart(2, '0')}`
      : d.kind === 'date'
        ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
        : `${String(d.day).padStart(2, '0')}.${String(d.month).padStart(2, '0')}.`;
