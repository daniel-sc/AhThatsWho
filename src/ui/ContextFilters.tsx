import { createEffect, createMemo, For, onCleanup } from 'solid-js';
import type { Context } from '../domain/types';

export function ContextFilters(props: {
  contexts: Context[];
  selected: string;
  select: (id: string) => void;
}) {
  let row!: HTMLDivElement;
  const ordered = createMemo(() =>
    [...props.contexts].sort(
      (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
    ),
  );
  createEffect(() => {
    props.selected;
    ordered();
    const frame = requestAnimationFrame(() => {
      const selected = row.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!selected) return;
      const bounds = row.getBoundingClientRect();
      const button = selected.getBoundingClientRect();
      // Only move the filter row; preserve the page's restored vertical position.
      if (button.left < bounds.left) row.scrollLeft -= bounds.left - button.left + 4;
      else if (button.right > bounds.right) row.scrollLeft += button.right - bounds.right + 4;
    });
    onCleanup(() => cancelAnimationFrame(frame));
  });
  return (
    <div class="filters" ref={row} role="group" aria-label="Filter by context">
      <button
        classList={{ selected: !props.selected }}
        aria-pressed={!props.selected}
        onClick={() => props.select('')}
      >
        All
      </button>
      <For each={ordered()}>
        {(context) => (
          <button
            classList={{ selected: props.selected === context.id }}
            aria-pressed={props.selected === context.id}
            onClick={() => props.select(context.id)}
          >
            {context.name}
          </button>
        )}
      </For>
    </div>
  );
}
