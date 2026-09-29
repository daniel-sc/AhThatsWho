import { afterEach, expect, test } from 'vitest';
import { AhThatsWhoDB, setMeta } from '../src/data/db';
import { isFreshNotebook } from '../src/data/onboarding';
import { fixtures } from '../src/domain/fixtures';
const databases: AhThatsWhoDB[] = [];
function database() {
  const d = new AhThatsWhoDB(crypto.randomUUID());
  databases.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(databases.splice(0).map((d) => d.delete()));
});
test('navigation metadata does not make a fresh notebook used, but drafts do', async () => {
  const d = database();
  await setMeta('ui', { screen: 'home' }, d);
  expect(await isFreshNotebook(d)).toBe(true);
  await setMeta('draft:household:new', { household: { people: [] } }, d);
  expect(await isFreshNotebook(d)).toBe(false);
  await d.meta.delete('draft:household:new');
  await setMeta('draft:capture', { text: 'A remembered detail' }, d);
  expect(await isFreshNotebook(d)).toBe(false);
});
test('trash, completed inbox, contexts, and restored empty notebooks are not fresh', async () => {
  const d = database();
  await d.households.put({ ...fixtures(1).households[0], deletedAt: new Date().toISOString() });
  expect(await isFreshNotebook(d)).toBe(false);
  await d.households.clear();
  await d.inbox.put({
    id: 'old',
    kind: 'text',
    text: 'Done',
    stage: 'discarded',
    hints: {},
    createdAt: '',
    updatedAt: '',
  });
  expect(await isFreshNotebook(d)).toBe(false);
  await d.inbox.clear();
  await d.contexts.put({ id: 'school', name: 'School', favorite: true });
  expect(await isFreshNotebook(d)).toBe(false);
  await d.contexts.clear();
  await setMeta('backup', { counter: 1, authoritative: true }, d);
  expect(await isFreshNotebook(d)).toBe(false);
});
