import { dateText, type Context, type HouseholdRecord } from './types';
export const normalize = (s: string) =>
  s
    .toLocaleLowerCase('de')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
export function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...next) > limit) return limit + 1;
    row = next;
  }
  return row[b.length];
}
export function wordMatch(word: string, text: string) {
  if (text.includes(word)) return true;
  const n = word.length < 4 ? 0 : word.length < 8 ? 1 : 2;
  return n > 0 && text.split(/[^\p{L}\p{N}]+/u).some((t) => distance(word, t, n) <= n);
}
export function fields(r: HouseholdRecord, contexts: Context[]) {
  const h = r.household;
  return [
    h.cue,
    h.notes,
    ...contexts.filter((c) => h.contextIds.includes(c.id)).map((c) => c.name),
    ...h.people.flatMap((p) => [
      p.firstName?.value,
      p.lastName?.value,
      p.role,
      p.birthDate && dateText(p.birthDate.value),
      p.ageNote?.value,
      p.notes,
      ...[p.firstName, p.lastName, p.birthDate, p.ageNote].map((v) => v?.certainty),
    ]),
  ].filter((x): x is string => !!x);
}
export function createSearchIndex(rows: HouseholdRecord[], contexts: Context[]) {
  return rows
    .filter((r) => !r.deletedAt)
    .map((record) => {
      const text = normalize(fields(record, contexts).join(' '));
      return { record, text, tokens: text.split(/[^\p{L}\p{N}]+/u) };
    });
}
export function searchIndex(
  index: ReturnType<typeof createSearchIndex>,
  query: string,
  contextId?: string,
) {
  const words = normalize(query).split(' ').filter(Boolean);
  const cache = new Map<string, boolean>();
  const global = index
    .filter((entry) =>
      words.every((w) => {
        if (entry.text.includes(w)) return true;
        const limit = w.length < 4 ? 0 : w.length < 8 ? 1 : 2;
        if (!limit) return false;
        return entry.tokens.some((t) => {
          const key = w + '|' + t;
          if (cache.has(key)) return cache.get(key)!;
          const matches = distance(w, t, limit) <= limit;
          cache.set(key, matches);
          return matches;
        });
      }),
    )
    .map((x) => x.record);
  const local = contextId
    ? global.filter((r) => r.household.contextIds.includes(contextId))
    : global;
  const fallback = !!(words.length && contextId && !local.length && global.length);
  return {
    rows: (fallback ? global : local).sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.household.id.localeCompare(b.household.id),
    ),
    fallback,
  };
}
export function search(
  rows: HouseholdRecord[],
  contexts: Context[],
  query: string,
  contextId?: string,
) {
  return searchIndex(createSearchIndex(rows, contexts), query, contextId);
}
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [{ text, match: false }];
  return text
    .split(/(\s+|[,;:()])/)
    .filter(Boolean)
    .map((t) => ({ text: t, match: words.some((w) => wordMatch(w, normalize(t))) }));
}
// Frozen FNV-1a palette mapping: do not change without a data-format decision.
export function signature(id: string) {
  let hash = 2166136261;
  for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) % 8;
}

export function matchingExcerpt(text: string, query: string, limit = 180) {
  let offset = 0;
  for (const part of highlight(text, query)) {
    if (part.match) break;
    offset += part.text.length;
  }
  const start = Math.max(0, offset - 50);
  return (
    (start ? '…' : '') + text.slice(start, start + limit) + (start + limit < text.length ? '…' : '')
  );
}
