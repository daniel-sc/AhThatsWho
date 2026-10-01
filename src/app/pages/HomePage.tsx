import { Show } from 'solid-js';
import { usePage } from '../page';
import { Icon } from '../../ui/Icon';
import { HouseholdList } from '../../ui/HouseholdList';
import { ContextFilters } from '../../ui/ContextFilters';
import { Welcome } from '../../ui/Welcome';

export default function HomePage() {
  const {
    ui,
    setUI,
    contexts,
    welcome,
    installation,
    results,
    navigate,
    openHousehold,
    newHousehold,
    capture,
    homeRestoreAnchor,
  } = usePage();
  const restoreAnchor = homeRestoreAnchor();
  return (
    <Show
      when={!welcome()}
      fallback={
        <Welcome
          add={newHousehold}
          capture={capture}
          restore={() => navigate('settings')}
          installation={installation}
        />
      }
    >
      <section>
        <h1 class="sr-only">Your people.</h1>
        <div class="search-results">
          <ContextFilters
            contexts={contexts()}
            selected={ui().context}
            select={(context) => {
              setUI({ ...ui(), context, homeAnchor: undefined });
            }}
          />
          <Show when={results().fallback}>
            <p class="notice">
              No matches in {contexts().find((c) => c.id === ui().context)?.name}. Showing matches
              from other contexts.{' '}
              <button
                class="quiet"
                onClick={() => {
                  setUI({ ...ui(), context: '', homeAnchor: undefined });
                }}
              >
                Show all contexts
              </button>
            </p>
          </Show>
          <div class="lookup-toolbar">
            <div class="list-heading" role="status" aria-live="polite">
              <span>
                {results().rows.length} {results().rows.length === 1 ? 'household' : 'households'}
              </span>
              <Show when={results().rows.length}>
                <span>Last edited</span>
              </Show>
            </div>
            <button class="add-button" onClick={newHousehold} aria-label="Add household">
              <Icon name="plus" />
            </button>
          </div>
          <HouseholdList
            rows={results().rows}
            contexts={contexts()}
            query={ui().query}
            restoreAnchor={restoreAnchor}
            open={openHousehold}
          />
          <Show when={!results().rows.length}>
            <div class="empty-state">
              <img class="empty-icon" src="/brand-mark.png" alt="" aria-hidden="true" />
              <h2>
                {ui().query
                  ? 'No familiar names yet?'
                  : ui().context
                    ? 'This context is empty.'
                    : 'A place for the people you know.'}
              </h2>
              <p>
                {ui().query
                  ? 'Try another detail, or capture something new.'
                  : 'Add a household or save a quick note. Your notebook works offline, without an account.'}
              </p>
              <div class="actions">
                <Show when={ui().query}>
                  <button
                    onClick={() => {
                      setUI({ ...ui(), query: '', homeAnchor: undefined });
                    }}
                  >
                    Clear search
                  </button>
                </Show>
                <button class="primary" onClick={newHousehold}>
                  Add household
                </button>
                <button onClick={capture}>Capture a note</button>
              </div>
              <Show when={!ui().query && !ui().context}>
                <button class="quiet" onClick={() => navigate('settings')}>
                  Import or restore
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </section>
    </Show>
  );
}
