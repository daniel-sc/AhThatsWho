import { Show } from 'solid-js';
import { usePage, MissingRecord } from '../page';
import { trashHousehold } from '../../data/db';
import { HouseholdView } from '../../ui/HouseholdView';

export default function HouseholdPage() {
  const { contexts, current, navigate, home, beginEdit, capture, history, act } = usePage();
  return (
    <Show
      when={current()}
      fallback={
        <MissingRecord href="/home" message="This household is not available on this device." />
      }
    >
      <section>
        <button class="quiet" onClick={() => navigate('home')}>
          ← Back to results
        </button>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Household</p>
            <h1>The names, together.</h1>
          </div>
          <button onClick={beginEdit}>Edit</button>
        </div>
        <HouseholdView household={current()!.household} contexts={contexts()} />
        <p class="fine">
          Edited {new Date(current()!.updatedAt).toLocaleString()} · {current()!.source.kind}
        </p>
        <div class="actions">
          <button class="primary" onClick={capture}>
            Capture an update
          </button>
          <button onClick={beginEdit}>Edit manually</button>
          <button onClick={() => void history()}>History</button>
          <button
            class="quiet danger"
            onClick={() => {
              if (confirm('Move this household to Trash? You can restore it later.'))
                void act(async () => {
                  await trashHousehold(current()!.household.id, current()!.versionId);
                  home();
                });
            }}
          >
            Move to trash
          </button>
        </div>
      </section>
    </Show>
  );
}
