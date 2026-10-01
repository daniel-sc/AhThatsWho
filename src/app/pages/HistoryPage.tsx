import { createResource, Show, For } from 'solid-js';
import { usePage, MissingRecord } from '../page';
import { db, restoreRevision } from '../../data/db';
import { HouseholdView } from '../../ui/HouseholdView';

export default function HistoryPage() {
  const { current, navigate, act } = usePage();
  const [revisions] = createResource(
    () => current()?.household.id,
    (id) => db.revisions.where('record.household.id').equals(id).reverse().sortBy('archivedAt'),
  );
  return (
    <Show
      when={current()}
      fallback={
        <MissingRecord href="/home" message="This household is not available on this device." />
      }
    >
      <section>
        <button class="quiet" onClick={() => navigate('household')}>
          ← Household
        </button>
        <h1>History</h1>
        <p class="muted">
          Previous snapshots keep their original source. Restoring creates a new edit.
        </p>
        <For each={revisions()}>
          {(r) => (
            <article class="history-card">
              <p class="eyebrow">
                {new Date(r.record.updatedAt).toLocaleString()} · {r.record.source.kind}
              </p>
              <HouseholdView
                household={r.record.household}
                contexts={Object.entries(r.contextNames).map(([id, name]) => ({
                  id,
                  name,
                  favorite: false,
                }))}
              />
              <button
                onClick={() => {
                  if (
                    confirm('Restore this snapshot? The current version will be kept in history.')
                  )
                    void act(async () => {
                      await restoreRevision(r, current()!.versionId);
                      navigate('household');
                    });
                }}
              >
                Restore this version
              </button>
            </article>
          )}
        </For>
        <Show when={!revisions()?.length}>
          <p>No previous versions yet.</p>
        </Show>
      </section>
    </Show>
  );
}
