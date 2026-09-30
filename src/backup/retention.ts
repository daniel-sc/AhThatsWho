import type { CloudSnapshot } from './contracts';
// Daily means UTC calendar day; retain the latest snapshot from each day.
export function retainedSnapshots(snapshots: CloudSnapshot[], now = Date.now()): Set<string> {
  const sorted = [...snapshots].sort(
    (a, b) => b.exportedAt.localeCompare(a.exportedAt) || b.id.localeCompare(a.id),
  );
  const keep = new Set(sorted.slice(0, 10).map((s) => s.id));
  const days = new Set<string>();
  const today = new Date(now).toISOString().slice(0, 10);
  const cutoff = Date.parse(`${today}T00:00:00Z`) - 29 * 86400000;
  for (const s of sorted) {
    const day = s.exportedAt.slice(0, 10);
    if (Date.parse(s.exportedAt) < cutoff || days.has(day)) continue;
    days.add(day);
    keep.add(s.id);
  }
  return keep;
}
