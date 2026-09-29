import { db, backupState, type AhThatsWhoDB } from './db';

// Count all records, including trash and completed captures. An empty result set
// is not evidence that this is a new notebook.
export async function isFreshNotebook(d: AhThatsWhoDB = db): Promise<boolean> {
  return d.transaction('r', d.tables, async () => {
    const counts = await Promise.all([
      d.households.count(),
      d.contexts.count(),
      d.inbox.count(),
      d.revisions.count(),
      d.audio.count(),
      d.meta.where('key').startsWith('draft:').count(),
    ]);
    const backup = await backupState(d);
    return counts.every((count) => count === 0) && backup.counter === 0 && !backup.authoritative;
  });
}
