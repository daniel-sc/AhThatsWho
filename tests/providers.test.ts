import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { generate, setKey, forgetKey } from '../src/providers/openai';
import { fixtures } from '../src/domain/fixtures';
import { uuid, now, type Capture } from '../src/domain/types';
const storage = new Map<string, string>();
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) || null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', fetchMock);
  setKey('synthetic-test-key', false);
  fetchMock.mockReset();
});
afterEach(() => {
  forgetKey();
  vi.unstubAllGlobals();
});
const capture = (): Capture => ({
  id: uuid(),
  kind: 'text',
  createdAt: now(),
  updatedAt: now(),
  text: 'Elena Example 1 has a red bicycle.',
  hints: { householdId: 'synthetic-0' },
  stage: 'source-ready',
});
const reply = (p: unknown) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(p) }] }],
    }),
  );
it('requests strict output without provider storage and binds the supplied base version', async () => {
  const b = fixtures(2);
  const r = b.households[0];
  fetchMock.mockResolvedValue(
    reply({
      action: 'update',
      targetId: r.household.id,
      household: { ...r.household, cue: 'Red bicycle' },
      candidateIds: [],
      contextSuggestions: [],
      reason: 'Update the cue',
    }),
  );
  const p = await generate(capture(), b.households, b.contexts);
  expect(p.baseVersion).toBe(r.versionId);
  expect(p.removals.length).toBeGreaterThan(0);
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload.model).toBe('gpt-6-luna');
  expect(payload.reasoning).toEqual({ effort: 'low' });
  expect(payload.store).toBe(false);
  expect(payload.text.format.strict).toBe(true);
});
it.each([
  ['unknown-person', 'person'],
  ['unknown-household', 'target'],
])('rejects an invented %s ID', async (id, kind) => {
  const b = fixtures(2);
  const r = b.households[0];
  const h = structuredClone(r.household);
  if (kind === 'person') h.people[0].id = id;
  fetchMock.mockResolvedValue(
    reply({
      action: 'update',
      targetId: kind === 'target' ? id : h.id,
      household: h,
      candidateIds: [],
      contextSuggestions: [],
      reason: 'Edit',
    }),
  );
  await expect(generate(capture(), b.households, b.contexts)).rejects.toThrow();
});
it.each([
  { status: 'incomplete', output: [] },
  { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'Declined' }] }] },
])('leaves refused or incomplete replies unapplied', async (response) => {
  const b = fixtures(2);
  fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
  await expect(generate(capture(), b.households, b.contexts)).rejects.toThrow();
});
it.each([401, 429, 500])('does not automatically retry HTTP %s', async (status) => {
  const b = fixtures(2);
  fetchMock.mockResolvedValue(new Response('{}', { status }));
  await expect(generate(capture(), b.households, b.contexts)).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
