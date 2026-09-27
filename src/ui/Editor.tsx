import { createSignal, For, Show, onMount } from 'solid-js';
import { db, getMeta, setMeta, saveContext } from '../data/db';
import { validDate } from '../domain/integrity';
import {
  uuid,
  type Context,
  type Household,
  type Person,
  type Value,
  type BirthDate,
} from '../domain/types';
export function Editor(props: {
  initial: Household;
  contexts: Context[];
  draftKey: string;
  baseVersion?: string;
  save: (h: Household, baseVersion?: string) => Promise<void>;
  cancel: () => void;
  error: (e: unknown) => void;
  title?: string;
}) {
  const [h, setH] = createSignal<Household>(structuredClone(props.initial));
  const [ready, setReady] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [draftStatus, setDraftStatus] = createSignal('');
  let writes = Promise.resolve();
  let baseVersion = props.baseVersion;
  onMount(async () => {
    const draft = await getMeta<{ household: Household; baseVersion?: string } | undefined>(
      props.draftKey,
      undefined,
    );
    if (draft) {
      setH(draft.household);
      baseVersion = draft.baseVersion;
      setDraftStatus('Recovered local draft · not applied');
    }
    setReady(true);
  });
  function update(fn: (h: Household) => void) {
    const next = structuredClone(h());
    fn(next);
    setH(next);
    setDraftStatus('Saving draft…');
    writes = writes
      .then(async () => {
        await setMeta(props.draftKey, { household: next, baseVersion });
        setDraftStatus('Local draft saved · not applied');
      })
      .catch((e) => {
        setDraftStatus('Draft could not be saved');
        props.error(e);
      });
  }
  function person(id: string, fn: (p: Person) => void) {
    update((h) => {
      const p = h.people.find((p) => p.id === id);
      if (p) fn(p);
    });
  }
  async function save() {
    setBusy(true);
    try {
      await writes;
      await props.save(h(), baseVersion);
      await db.meta.delete(props.draftKey);
    } catch (e) {
      props.error(e);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    await writes;
    await db.meta.delete(props.draftKey);
    props.cancel();
  }
  function ValueInput(p: {
    id: string;
    field: 'firstName' | 'lastName' | 'ageNote';
    label: string;
  }) {
    const v = () => h().people.find((x) => x.id === p.id)?.[p.field];
    return (
      <div class="value-input">
        <label>
          {p.label}
          <input
            value={v()?.value || ''}
            maxLength={2000}
            onInput={(e) =>
              person(p.id, (x) => {
                x[p.field] = e.currentTarget.value
                  ? { ...x[p.field], value: e.currentTarget.value }
                  : undefined;
              })
            }
          />
        </label>
        <label class="certainty">
          Certainty
          <select
            value={v()?.certainty || ''}
            onChange={(e) =>
              person(p.id, (x) => {
                if (x[p.field])
                  x[p.field]!.certainty = (e.currentTarget.value ||
                    undefined) as Value['certainty'];
              })
            }
          >
            <option value="">Unmarked</option>
            <option value="uncertain">Unsure</option>
            <option value="approximate">Approximate</option>
          </select>
        </label>
      </div>
    );
  }
  function DateInput(p: { id: string }) {
    const current = () => h().people.find((x) => x.id === p.id)?.birthDate;
    const [kind, setKind] = createSignal(current()?.value.kind || '');
    const [year, setYear] = createSignal(
      'year' in (current()?.value || {})
        ? String((current()!.value as { year: number }).year || '')
        : '',
    );
    const [month, setMonth] = createSignal(
      'month' in (current()?.value || {})
        ? String((current()!.value as { month: number }).month || '')
        : '',
    );
    const [day, setDay] = createSignal(
      'day' in (current()?.value || {})
        ? String((current()!.value as { day: number }).day || '')
        : '',
    );
    const [issue, setIssue] = createSignal('');
    function commit() {
      if (!kind()) {
        person(p.id, (x) => delete x.birthDate);
        setIssue('');
        return;
      }
      const d = {
        kind: kind(),
        ...(kind() !== 'month-day' ? { year: Number(year()) } : {}),
        ...(kind() !== 'year' ? { month: Number(month()) } : {}),
        ...(['date', 'month-day'].includes(kind()) ? { day: Number(day()) } : {}),
      } as BirthDate;
      person(p.id, (x) => (x.birthDate = { value: d, certainty: x.birthDate?.certainty }));
      try {
        validDate(d);
        setIssue('');
      } catch {
        setIssue('Complete a valid date before saving this household.');
      }
    }
    return (
      <fieldset>
        <legend>Optional date</legend>
        <label>
          Precision
          <select
            value={kind()}
            onChange={(e) => {
              setKind(e.currentTarget.value as typeof kind extends () => infer T ? T : never);
              commit();
            }}
          >
            <option value="">No date</option>
            <option value="year">Year only</option>
            <option value="year-month">Year and month</option>
            <option value="date">Full date</option>
            <option value="month-day">Day and month (no year)</option>
          </select>
        </label>
        <Show when={kind()}>
          <div class="date-parts">
            <Show when={kind() !== 'month-day'}>
              <label>
                Year
                <input
                  inputmode="numeric"
                  value={year()}
                  onInput={(e) => {
                    setYear(e.currentTarget.value);
                    commit();
                  }}
                />
              </label>
            </Show>
            <Show when={kind() !== 'year'}>
              <label>
                Month
                <input
                  inputmode="numeric"
                  value={month()}
                  onInput={(e) => {
                    setMonth(e.currentTarget.value);
                    commit();
                  }}
                />
              </label>
            </Show>
            <Show when={kind() === 'date' || kind() === 'month-day'}>
              <label>
                Day
                <input
                  inputmode="numeric"
                  value={day()}
                  onInput={(e) => {
                    setDay(e.currentTarget.value);
                    commit();
                  }}
                />
              </label>
            </Show>
          </div>
          <label>
            Date certainty
            <select
              value={current()?.certainty || ''}
              onChange={(e) =>
                person(p.id, (x) => {
                  if (x.birthDate)
                    x.birthDate.certainty =
                      (e.currentTarget.value as Value['certainty']) || undefined;
                })
              }
            >
              <option value="">Unmarked</option>
              <option value="uncertain">Unsure</option>
              <option value="approximate">Approximate</option>
            </select>
          </label>
        </Show>
        <Show when={issue()}>
          <small role="status">{issue()}</small>
        </Show>
      </fieldset>
    );
  }
  return (
    <section>
      <div class="section-heading">
        <div>
          <p class="eyebrow">NOT YET APPLIED</p>
          <h1>{props.title || 'Edit household'}</h1>
        </div>
      </div>
      <p class="muted" role="status">
        {draftStatus() || 'Changes apply only when you save.'}
      </p>
      <Show when={ready()}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <For each={h().people.map((p) => p.id)}>
            {(id) => (
              <fieldset class="person-editor">
                <legend>Person</legend>
                <ValueInput id={id} field="firstName" label="First name" />
                <ValueInput id={id} field="lastName" label="Last name" />
                <label>
                  Role
                  <select
                    value={h().people.find((p) => p.id === id)?.role || ''}
                    onChange={(e) =>
                      person(
                        id,
                        (p) => (p.role = (e.currentTarget.value as Person['role']) || undefined),
                      )
                    }
                  >
                    <option value="">Not specified</option>
                    <option value="adult">Adult</option>
                    <option value="child">Child</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <DateInput id={id} />
                <ValueInput id={id} field="ageNote" label="Age or original date wording" />
                <label>
                  Person notes
                  <textarea
                    value={h().people.find((p) => p.id === id)?.notes || ''}
                    onInput={(e) =>
                      person(id, (p) => (p.notes = e.currentTarget.value || undefined))
                    }
                    maxLength={20000}
                  />
                </label>
                <button
                  type="button"
                  class="quiet danger"
                  onClick={() => update((h) => (h.people = h.people.filter((p) => p.id !== id)))}
                >
                  Remove person from draft
                </button>
              </fieldset>
            )}
          </For>
          <button type="button" onClick={() => update((h) => h.people.push({ id: uuid() }))}>
            + Add person
          </button>
          <label>
            Memory cue
            <input
              value={h().cue || ''}
              onInput={(e) => update((h) => (h.cue = e.currentTarget.value || undefined))}
              maxLength={20000}
            />
          </label>
          <label>
            Household notes
            <textarea
              value={h().notes || ''}
              onInput={(e) => update((h) => (h.notes = e.currentTarget.value || undefined))}
              maxLength={20000}
            />
          </label>
          <fieldset>
            <legend>Contexts</legend>
            <For each={props.contexts}>
              {(c) => (
                <label class="check">
                  <input
                    type="checkbox"
                    checked={h().contextIds.includes(c.id)}
                    onChange={(e) =>
                      update(
                        (h) =>
                          (h.contextIds = e.currentTarget.checked
                            ? [...h.contextIds, c.id]
                            : h.contextIds.filter((id) => id !== c.id)),
                      )
                    }
                  />
                  {c.name}
                </label>
              )}
            </For>
            <button
              type="button"
              class="quiet"
              onClick={async () => {
                const name = prompt('New context name');
                if (name?.trim())
                  try {
                    const c = { id: uuid(), name: name.trim(), favorite: false };
                    await saveContext(c);
                    update((h) => h.contextIds.push(c.id));
                  } catch (e) {
                    props.error(e);
                  }
              }}
            >
              + Create context
            </button>
          </fieldset>
          <div class="actions sticky-actions">
            <button class="primary" disabled={busy()} type="submit">
              {busy() ? 'Saving…' : 'Save'}
            </button>
            <button type="button" disabled={busy()} onClick={() => void cancel()}>
              Cancel & discard draft
            </button>
          </div>
        </form>
      </Show>
    </section>
  );
}
