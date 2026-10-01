import { Show, For } from 'solid-js';
import { usePage } from '../page';
import { trashHousehold } from '../../data/db';
import { HouseholdView } from '../../ui/HouseholdView';

export default function TrashPage() {
  const { rows, contexts, navigate, act } = usePage();
  return (
    <section>
      <button class="quiet" onClick={() => navigate('settings')}>
        ← Settings
      </button>
      <h1>Trash</h1>
      <p class="muted">Removed households stay here until you restore them.</p>
      <For each={rows().filter((r) => r.deletedAt)}>
        {(r) => (
          <article class="history-card">
            <HouseholdView household={r.household} contexts={contexts()} compact />
            <button
              onClick={() => void act(() => trashHousehold(r.household.id, r.versionId, true))}
            >
              Restore household
            </button>
          </article>
        )}
      </For>
      <Show when={!rows().some((r) => r.deletedAt)}>
        <p>Trash is empty.</p>
      </Show>
    </section>
  );
}
