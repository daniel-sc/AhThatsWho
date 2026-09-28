import { createSignal, createMemo, createEffect, For, onMount, onCleanup, on } from 'solid-js';
import type { Context, HouseholdRecord } from '../domain/types';
import { HouseholdView } from './HouseholdView';
// Variable-height windowing keeps large notebooks responsive without clipping people.
export function HouseholdList(props: {
  rows: HouseholdRecord[];
  contexts: Context[];
  query: string;
  restoreAnchor?: { id: string; top: number };
  open: (r: HouseholdRecord) => void;
}) {
  let list!: HTMLDivElement;
  const [viewport, setViewport] = createSignal({ y: 0, height: 900 });
  const [sizes, setSizes] = createSignal(new Map<string, number>());
  const key = (r: HouseholdRecord) => `${r.household.id}:${r.versionId}:${props.query}`;
  const offsets = createMemo(() => {
    const result = [0];
    for (const r of props.rows)
      result.push(result[result.length - 1] + (sizes().get(key(r)) || 142));
    return result;
  });
  const range = createMemo(() => {
    if (props.rows.length <= 60) return { start: 0, end: props.rows.length };
    const positions = offsets();
    const top = viewport().y;
    let low = 0,
      high = props.rows.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (positions[mid] < top) low = mid + 1;
      else high = mid;
    }
    const start = Math.max(0, low - 7);
    let end = low;
    while (end < props.rows.length && positions[end] < top + viewport().height + 850) end++;
    return { start, end: Math.min(props.rows.length, end + 5) };
  });
  createEffect(
    on(
      () => props.query,
      () => setSizes(new Map()),
    ),
  );
  const measure = () => {
    if (list)
      setViewport({
        y: Math.max(0, -list.getBoundingClientRect().top),
        height: window.innerHeight,
      });
  };
  onMount(() => {
    measure();
    const anchor = props.restoreAnchor;
    if (anchor) {
      const index = props.rows.findIndex((r) => r.household.id === anchor.id);
      if (index >= 0) {
        let frames = 0;
        const restore = () => {
          if (!list.isConnected) return;
          const top = list.getBoundingClientRect().top + window.scrollY;
          window.scrollTo(0, top + offsets()[index] - anchor.top);
          measure();
          if (++frames < 4) requestAnimationFrame(restore);
        };
        requestAnimationFrame(restore);
      }
    }
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
  });
  onCleanup(() => {
    window.removeEventListener('scroll', measure);
    window.removeEventListener('resize', measure);
  });
  createEffect(() => {
    props.rows;
    props.query;
    requestAnimationFrame(measure);
  });
  function Row(p: { record: HouseholdRecord }) {
    let button!: HTMLButtonElement;
    onMount(() => {
      let frame: number | undefined;
      const observer = new ResizeObserver((entries) => {
        const height =
          entries[0]?.borderBoxSize?.[0]?.blockSize || button.getBoundingClientRect().height;
        const k = key(p.record);
        if (frame !== undefined) cancelAnimationFrame(frame);
        // Updating the rendered rows during resize delivery can trigger an observer loop.
        frame = requestAnimationFrame(() => {
          frame = undefined;
          if (k === key(p.record) && height && Math.abs((sizes().get(k) || 142) - height) > 1)
            setSizes((old) => new Map(old).set(k, height));
        });
      });
      observer.observe(button);
      onCleanup(() => {
        observer.disconnect();
        if (frame !== undefined) cancelAnimationFrame(frame);
      });
    });
    return (
      <button
        ref={button}
        data-household={p.record.household.id}
        class="household-row"
        onClick={() => props.open(p.record)}
      >
        <HouseholdView
          household={p.record.household}
          contexts={props.contexts}
          query={props.query}
          compact
        />
        <span class="row-arrow" aria-hidden="true">
          ›
        </span>
      </button>
    );
  }
  return (
    <div ref={list} class="household-list" role="list" aria-label="Matching households">
      <div aria-hidden="true" style={{ height: `${offsets()[range().start]}px` }} />
      <For each={props.rows.slice(range().start, range().end)}>
        {(r, i) => (
          <div
            role="listitem"
            aria-posinset={range().start + i() + 1}
            aria-setsize={props.rows.length}
          >
            <Row record={r} />
          </div>
        )}
      </For>
      <div
        aria-hidden="true"
        style={{ height: `${offsets()[props.rows.length] - offsets()[range().end]}px` }}
      />
    </div>
  );
}
