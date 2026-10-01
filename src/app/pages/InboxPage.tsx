import { Show, For } from 'solid-js';
import { usePage } from '../page';

export default function InboxPage() {
  const { ui, setUI, inbox, unresolved, navigate, capture } = usePage();
  return (
    <section>
      <h1>Your inbox</h1>
      <div class="filters">
        <button
          classList={{ selected: !ui().completed }}
          aria-pressed={!ui().completed}
          onClick={() => setUI({ ...ui(), completed: false })}
        >
          To review · {unresolved().length}
        </button>
        <button
          classList={{ selected: ui().completed }}
          aria-pressed={ui().completed}
          onClick={() => setUI({ ...ui(), completed: true })}
        >
          Completed
        </button>
      </div>
      <For
        each={inbox()
          .filter((c) =>
            ui().completed ? c.stage === 'applied' : !['applied', 'discarded'].includes(c.stage),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
      >
        {(c) => (
          <button class="inbox-row" onClick={() => navigate('review', { capture: c.id })}>
            <span class="eyebrow">
              {c.kind === 'audio' ? 'Voice note' : 'Text note'} ·{' '}
              {new Date(c.createdAt).toLocaleDateString()}
            </span>
            <strong>{(c.transcript || c.text || 'Saved audio recording').slice(0, 160)}</strong>
            <span class="muted">
              {c.attempt
                ? 'Processing…'
                : c.error
                  ? 'Retry · ' + c.error
                  : c.stage === 'proposed'
                    ? 'Review proposal'
                    : c.stage === 'needs-target'
                      ? 'Choose target'
                      : c.stage === 'missing-source'
                        ? 'Recover missing source'
                        : c.stage === 'applied'
                          ? 'Applied'
                          : c.kind === 'audio' && !c.transcript
                            ? 'Transcribe'
                            : 'Process or review manually'}{' '}
              →
            </span>
          </button>
        )}
      </For>
      <Show when={ui().completed && !inbox().some((c) => c.stage === 'applied')}>
        <div class="empty-state">
          <h2>No completed captures yet.</h2>
          <p>Notes you apply to your notebook will appear here.</p>
        </div>
      </Show>
      <Show when={!unresolved().length && !ui().completed}>
        <div class="empty-state">
          <h2>Nothing waiting on you.</h2>
          <p>Capture a name or a detail now. It will be here when you have a moment.</p>
          <button onClick={capture}>Capture a note</button>
        </div>
      </Show>
    </section>
  );
}
