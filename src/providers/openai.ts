import { defaultRecognitionLanguages } from '../domain/languages';
import { assert, validateHousehold } from '../domain/integrity';
import {
  now,
  personName,
  type Capture,
  type Context,
  type Household,
  type HouseholdRecord,
  type Proposal,
} from '../domain/types';
import { normalize, wordMatch } from '../domain/search';
import { removals } from '../capture/application';
import {
  PARSER_MODEL,
  TRANSCRIPTION_MODEL,
  MAX_AUDIO_BYTES,
  TRANSCRIPTION_PROMPT,
  responseBody,
  type GenerationMode,
} from './openai-contract';
export { PARSER_MODEL, TRANSCRIPTION_MODEL } from './openai-contract';
export type AIMode = 'sponsored' | 'personal';
export function getAIMode(): AIMode {
  return localStorage.getItem('ahthatswho.ai-mode') === 'personal' ? 'personal' : 'sponsored';
}
export function setAIMode(mode: AIMode) {
  localStorage.setItem('ahthatswho.ai-mode', mode);
}
let sessionKey = '';
export function getKey() {
  return sessionKey || localStorage.getItem('ahthatswho.openai') || '';
}
export function setKey(key: string, remember: boolean) {
  sessionKey = key.trim();
  localStorage.removeItem('ahthatswho.openai');
  if (remember && sessionKey) localStorage.setItem('ahthatswho.openai', sessionKey);
}
export function forgetKey() {
  sessionKey = '';
  localStorage.removeItem('ahthatswho.openai');
}
async function request(path: string, body?: BodyInit, json = false) {
  const sponsored = getAIMode() === 'sponsored';
  const key = sponsored ? '' : getKey();
  assert(sponsored || key, 'Add your OpenAI key in Settings, or choose Sponsored AI.');
  assert(navigator.onLine, 'You are offline. Your capture is saved; retry online.');
  const sponsoredPath =
    path === 'responses' ? 'generate' : path === 'audio/transcriptions' ? 'transcribe' : 'check';
  let r: Response;
  try {
    r = await fetch(sponsored ? `/api/ai/${sponsoredPath}` : `https://api.openai.com/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(!sponsored ? { Authorization: `Bearer ${key}` } : {}),
        ...(json ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    throw new Error(
      'AI could not be reached or took too long. Your source is saved; retry when online.',
    );
  }
  if (!r.ok)
    throw new Error(
      sponsored && r.status === 429
        ? 'Sponsored AI has reached a rate or spending limit. Your source is saved. Retry later or choose your own API key in Settings.'
        : sponsored && [401, 403, 503].includes(r.status)
          ? 'Sponsored AI is unavailable. Your source is saved. Retry later or choose your own API key in Settings.'
          : r.status === 413
            ? 'The capture or notebook context is too large to process. Your source is saved; shorten it or edit manually.'
            : r.status === 401
              ? 'OpenAI rejected the key. Update it in Settings.'
              : r.status === 429
                ? 'OpenAI rate or credit limit reached. Retry later.'
                : `OpenAI request failed (${r.status}). Your source is saved.`,
    );
  try {
    return await r.json();
  } catch {
    throw new Error('AI returned an unreadable response. Your source is saved; retry later.');
  }
}
export async function checkConnection() {
  if (getAIMode() === 'sponsored') {
    await request('check');
    return `Sponsored AI has access to ${PARSER_MODEL} and ${TRANSCRIPTION_MODEL}. No inference requested; spending availability is checked when processing.`;
  }
  await request(`models/${PARSER_MODEL}`);
  await request(`models/${TRANSCRIPTION_MODEL}`);
  return `Access confirmed for ${PARSER_MODEL} and ${TRANSCRIPTION_MODEL}. No inference requested.`;
}
export function retrieve(c: Capture, rows: HouseholdRecord[], contexts: Context[]) {
  const words = normalize(c.transcript || c.text || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
  return rows
    .filter((r) => !r.deletedAt)
    .map((r) => {
      const names = normalize(r.household.people.map(personName).join(' '));
      const notes = normalize(
        `${r.household.cue || ''} ${r.household.notes || ''} ${r.household.people.map((p) => p.notes || '').join(' ')}`,
      );
      const score =
        words.reduce(
          (s, w) => s + (wordMatch(w, names) ? 8 : 0) + (wordMatch(w, notes) ? 1 : 0),
          0,
        ) +
        (c.hints.householdId === r.household.id ? 10 : 0) +
        (c.hints.contextId && r.household.contextIds.includes(c.hints.contextId) ? 2 : 0);
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.r);
}
function stripNull(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(stripNull);
  if (x && typeof x === 'object')
    return Object.fromEntries(
      Object.entries(x)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNull(v)]),
    );
  return x;
}
export async function generate(
  c: Capture,
  rows: HouseholdRecord[],
  contexts: Context[],
  languages: string[] = defaultRecognitionLanguages,
  mode: GenerationMode = 'auto',
): Promise<Proposal> {
  const source =
    c.kind === 'audio' ? [c.text, c.transcript].filter(Boolean).join('\n') : c.transcript || c.text;
  assert(source && source.trim(), 'No source text. Transcribe or enter text first.');
  assert(source.length <= 20000, 'Capture is too long');
  const candidates = mode === 'new' ? [] : retrieve(c, rows, contexts);
  const index = (mode === 'new' ? [] : rows)
    .filter((r) => !r.deletedAt)
    .map((r) => ({ id: r.household.id, names: r.household.people.map(personName) }));
  const input = {
    source,
    expectedLanguages: languages,
    hints: mode === 'new' ? { contextId: c.hints.contextId } : c.hints,
    candidates,
    contexts,
    nameIndex: index.slice(0, 5000),
    ...(mode === 'new' ? { mode } : {}),
  };
  const response = await request(
    'responses',
    JSON.stringify(getAIMode() === 'sponsored' ? input : responseBody(input, mode)),
    true,
  );
  assert(
    response.status === 'completed',
    'OpenAI response was incomplete. Retry or edit manually.',
  );
  const content = response.output?.flatMap((o: { content?: unknown[] }) => o.content || []) || [];
  assert(
    !content.some((x: { type: string }) => x.type === 'refusal'),
    'OpenAI declined this request. You can edit manually.',
  );
  const raw = content
    .filter((x: { type: string }) => x.type === 'output_text')
    .map((x: { text: string }) => x.text)
    .join('');
  assert(raw, 'No proposal returned');
  const p = stripNull(JSON.parse(raw)) as Proposal;
  p.generatedAt = now();
  p.model = PARSER_MODEL;
  p.contextSuggestions = p.contextSuggestions || [];
  p.removals = [];
  assert(
    ['create', 'update', 'ambiguous', 'multiple'].includes(p.action),
    'Invalid action returned',
  );
  assert(
    mode !== 'new' || p.action === 'create' || p.action === 'multiple',
    'AI did not return a new household draft. Your previous proposal is kept; try again.',
  );
  assert(
    Array.isArray(p.candidateIds) && p.candidateIds.every((id) => index.some((r) => r.id === id)),
    'Unknown candidate ID returned',
  );
  assert(
    Array.isArray(p.contextSuggestions) && p.contextSuggestions.length === 0,
    'Create new contexts in Settings, then process this capture again.',
  );
  if (p.action === 'create' || p.action === 'update') {
    assert(p.household, 'Missing household');
    const allowed = new Set(contexts.map((x) => x.id));
    validateHousehold(p.household, allowed);
    let current: HouseholdRecord | undefined;
    if (p.action === 'update') {
      current = candidates.find((r) => r.household.id === p.targetId);
      assert(current && current.household.id === p.household.id, 'Update target was not supplied');
      p.baseVersion = current.versionId;
      p.removals = removals(current.household, p.household);
    } else {
      assert(!p.targetId, 'New household must not have an existing target');
      assert(p.household.id.startsWith('tmp:'), 'New household ID must be temporary');
    }
    assert(
      p.household.people.every(
        (x) => x.id.startsWith('tmp:') || current?.household.people.some((y) => y.id === x.id),
      ),
      'Unexpected person ID returned',
    );
  }
  return p;
}
export function transcriptionKeywords(
  rows: HouseholdRecord[],
  contexts: Context[],
  hints: Capture['hints'] = {},
) {
  const active = rows.filter((r) => !r.deletedAt);
  const selected = active.find((r) => r.household.id === hints.householdId);
  const contextIds = new Set([
    ...(selected?.household.contextIds || []),
    ...(hints.contextId ? [hints.contextId] : []),
  ]);
  const relevant = active.filter((r) => r.household.contextIds.some((id) => contextIds.has(id)));
  const names = (records: HouseholdRecord[]) =>
    records.flatMap((r) =>
      r.household.people.map((p) =>
        [p.firstName?.value, p.lastName?.value].filter(Boolean).join(' '),
      ),
    );
  const terms = [
    ...names(selected ? [selected] : []),
    ...names(relevant),
    ...contexts.filter((c) => contextIds.has(c.id)).map((c) => c.name),
    ...names(active),
    ...contexts.map((c) => c.name),
  ];
  const seen = new Set<string>();
  const keywords: string[] = [];
  let length = 0;
  for (const term of terms) {
    const keyword = term
      .replace(/[<>\r\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const key = keyword.normalize('NFC').toLocaleLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    if (length + keyword.length > 1500) continue;
    keywords.push(keyword);
    length += keyword.length;
    if (keywords.length >= 50) break;
  }
  return keywords;
}
export async function transcribe(
  blob: Blob,
  mime: string,
  rows: HouseholdRecord[],
  contexts: Context[],
  languages: string[] = defaultRecognitionLanguages,
  hints: Capture['hints'] = {},
) {
  assert(blob.size > 0 && blob.size <= MAX_AUDIO_BYTES, 'Audio must be nonempty and under 25 MB');
  const extension = mime.includes('mp4')
    ? 'm4a'
    : mime.includes('webm')
      ? 'webm'
      : mime.includes('ogg')
        ? 'ogg'
        : mime.includes('wav')
          ? 'wav'
          : undefined;
  assert(extension, 'This browser audio format is not supported');
  const form = new FormData();
  form.append('file', blob, `capture.${extension}`);
  form.append('model', TRANSCRIPTION_MODEL);
  for (const language of languages) form.append('languages[]', language);
  form.append('prompt', TRANSCRIPTION_PROMPT);
  for (const keyword of transcriptionKeywords(rows, contexts, hints)) {
    form.append('keywords[]', keyword);
  }
  const result = await request('audio/transcriptions', form);
  assert(typeof result.text === 'string' && result.text.trim(), 'No speech was transcribed');
  return result.text as string;
}
