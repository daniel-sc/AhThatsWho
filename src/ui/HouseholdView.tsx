import { For, Show } from 'solid-js';
import {
  dateText,
  personName,
  type Context,
  type Household,
  type Person,
  type Value,
} from '../domain/types';
import { highlight, matchingExcerpt } from '../domain/search';
import { PersonImage } from './PersonImage';
export const certainty = (v?: Value<unknown>) =>
  v?.certainty === 'uncertain' ? ' ?' : v?.certainty === 'approximate' ? ' ≈' : '';
export function Highlight(props: { text?: string; query?: string }) {
  return (
    <For each={highlight(props.text || '', props.query || '')}>
      {(p) => (p.match ? <mark>{p.text}</mark> : p.text)}
    </For>
  );
}
export function HouseholdView(props: {
  household: Household;
  contexts: Context[];
  query?: string;
  compact?: boolean;
  review?: boolean;
  editImage?: (person: Person) => void;
}) {
  const h = () => props.household;
  const names = () => h().people.filter((p) => p.role === 'adult' || !p.role);
  const others = () => h().people.filter((p) => p.role === 'child' || p.role === 'other');
  function InlineImage(p: { person: Person }) {
    return (
      <Show when={props.compact && props.editImage}>
        <button
          type="button"
          class="inline-image-button"
          data-person-image={p.person.id}
          aria-label={`${p.person.imageAssetId ? 'Edit' : 'Add'} image for ${personName(p.person)}`}
          onClick={() => props.editImage?.(p.person)}
        >
          <Show
            when={p.person.imageAssetId}
            fallback={
              <span class="inline-image-placeholder" aria-hidden="true">
                <span class="inline-empty-mark" />
              </span>
            }
          >
            {(assetId) => (
              <PersonImage
                assetId={assetId()}
                name={personName(p.person)}
                preview
                class="inline-portrait"
                placeholder={<span class="inline-empty-mark" aria-hidden="true" />}
              />
            )}
          </Show>
        </button>
      </Show>
    );
  }
  const summary = () =>
    props.compact
      ? h().cue?.trim() ||
        h().notes?.trim() ||
        (h().people.length === 1 ? h().people[0].notes?.trim() : undefined)
      : h().cue;
  return (
    <div class="household" classList={{ 'compact-household': props.compact }}>
      <Show when={props.compact && !props.editImage && h().people.find((p) => p.imageAssetId)}>
        {(person) => (
          <PersonImage
            class="card-portrait"
            assetId={person().imageAssetId!}
            name={personName(person())}
            preview
          />
        )}
      </Show>
      <div class="household-text">
        <div class="names">
          <Show
            when={names().length}
            fallback={<span>{h().people.length ? 'Household' : 'Memory cue'}</span>}
          >
            <For each={names()}>
              {(p) => (
                <span class="person-name">
                  <InlineImage person={p} />
                  <Show when={p.firstName?.value}>
                    <span class="first-name">
                      <Highlight
                        text={p.firstName?.value + certainty(p.firstName)}
                        query={props.query}
                      />
                    </span>
                  </Show>
                  <Show when={p.firstName?.value && p.lastName?.value}> </Show>
                  <Show when={p.lastName?.value}>
                    <span class="last-name">
                      <Highlight
                        text={p.lastName?.value + certainty(p.lastName)}
                        query={props.query}
                      />
                    </span>
                  </Show>
                  <Show when={!p.firstName?.value && !p.lastName?.value}>
                    <span class="first-name">{personName(p)}</span>
                  </Show>
                  <Show when={props.review}>
                    <small class="review-role">{p.role || 'Role not specified'}</small>
                  </Show>
                </span>
              )}
            </For>
          </Show>
        </div>
        <Show when={others().length || h().contextIds.length}>
          <div class="household-summary">
            <Show when={others().length}>
              <div class="members">
                <For each={others()}>
                  {(p, i) => (
                    <>
                      <Show when={i() > 0}> · </Show>
                      <InlineImage person={p} />
                      <Highlight
                        text={personName(p) + certainty(p.firstName) + certainty(p.lastName)}
                        query={props.query}
                      />
                      <Show when={props.review}>
                        <small class="review-role">{p.role}</small>
                      </Show>
                      <Show when={!props.review && p.role === 'other'}> (other)</Show>
                    </>
                  )}
                </For>
              </div>
            </Show>
            <Show when={h().contextIds.length}>
              <div class="tags">
                <For each={h().contextIds}>
                  {(id) => (
                    <span>
                      <Highlight
                        text={props.contexts.find((c) => c.id === id)?.name || 'Historical context'}
                        query={props.query}
                      />
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
        <Show when={summary()}>
          <div class="cue" classList={{ 'compact-cue': props.compact }}>
            <Highlight text={summary()} query={props.query} />
          </div>
        </Show>
        <Show when={!props.compact}>
          <For
            each={h().people.filter(
              (p) => !props.review || p.imageAssetId || p.birthDate || p.ageNote || p.notes,
            )}
          >
            {(p) => (
              <div class="person-detail">
                <Show when={p.imageAssetId}>
                  {(assetId) => (
                    <PersonImage
                      class="detail-portrait"
                      assetId={assetId()}
                      name={personName(p)}
                      enlarge
                    />
                  )}
                </Show>
                <strong>{personName(p)}</strong>
                <span class="muted">{p.role || 'Role not specified'}</span>
                <Show when={p.birthDate}>
                  <p>
                    Date: {p.birthDate && dateText(p.birthDate.value)}
                    {certainty(p.birthDate)}
                  </p>
                </Show>
                <Show when={p.ageNote}>
                  <p>
                    {p.ageNote?.value}
                    {certainty(p.ageNote)}
                  </p>
                </Show>
                <Show when={p.notes}>
                  <p class="preserve">{p.notes}</p>
                </Show>
              </div>
            )}
          </For>
          <Show when={h().notes}>
            <p class="preserve">{h().notes}</p>
          </Show>
        </Show>
        <Show when={props.compact && props.query}>
          <For
            each={[
              h().notes,
              ...h().people.flatMap((p) => [
                p.notes,
                p.ageNote?.value,
                p.birthDate && dateText(p.birthDate.value),
                p.role,
              ]),
            ]
              .filter(
                (x): x is string => !!x && highlight(x, props.query || '').some((x) => x.match),
              )
              .slice(0, 1)}
          >
            {(text) => (
              <p class="excerpt">
                <Highlight text={matchingExcerpt(text, props.query || '')} query={props.query} />
              </p>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
