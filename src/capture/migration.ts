import { db, dirty } from '../data/db';
import { digest } from '../backup/portable';
import { now, uuid, type Capture } from '../domain/types';
import { assert } from '../domain/integrity';
// Deliberately retains each line verbatim. It never guesses family roles or dates.
export async function stagePrivateLines(source: string) {
  assert(source.trim() && source.length <= 100000, 'Enter a note under 100,000 characters');
  const hash = await digest(source);
  const lines = source.split(/\r?\n/).filter((x) => x.trim());
  assert(lines.length <= 500, 'Import at most 500 source lines');
  return db.transaction('rw', [db.inbox, db.meta], async () => {
    const key = `migration:${hash}`;
    if (
      (await db.meta.get(key)) ||
      (await db.inbox.toArray()).some((c) => c.sourceRef?.startsWith(`${hash}:line:`))
    )
      throw new Error('This exact note batch has already been staged. Check Inbox.');
    const at = now();
    const captures: Capture[] = lines.map((text, i) => ({
      id: uuid(),
      createdAt: at,
      updatedAt: at,
      kind: 'text',
      text,
      hints: {},
      stage: 'source-ready',
      sourceRef: `${hash}:line:${i + 1}`,
    }));
    await db.inbox.bulkAdd(captures);
    await db.meta.put({ key, value: { ids: captures.map((c) => c.id) } });
    await dirty();
    return captures.length;
  });
}
