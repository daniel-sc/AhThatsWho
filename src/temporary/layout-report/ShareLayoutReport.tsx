import { createSignal, Show } from 'solid-js';
import { ActionFeedback } from '../../ui/ActionFeedback';
import { isReportDevice } from './install';
import { layoutMeasurements } from './recorder';

function layoutReportText() {
  const data = layoutMeasurements();
  function section(title: string, rows: typeof data.recent) {
    return [
      title,
      ...rows.map(([t, ...fields]) => `${new Date(t).toISOString()} ${fields.join(' ')}`),
      ...(rows.length ? [] : ['None recorded.']),
    ].join('\n');
  }
  return [
    'AhThatsWho · iPhone Home Screen layout report v1',
    'UTC | build | event | screen | width | windowH | visualH | visualTop | zoom | scrollY | navBottom | actionsBottom (-1=absent) | editable (0/1)',
    section('Latest suspected episode (including lead-up)', data.episode),
    section('Last healthy portrait measurement', data.healthy),
    section('Recent activity before Settings', data.recent),
  ].join('\n\n');
}

export function ShareLayoutReport() {
  const [text, setText] = createSignal('');
  const [error, setError] = createSignal('');
  const [message, setMessage] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  async function share() {
    const report = layoutReportText();
    setError('');
    setMessage('');
    setText('');
    setBusy(true);
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ text: report }))) {
        await navigator.share({ text: report });
      } else {
        setText(report);
        setMessage('Copy the report to send it in a message or email.');
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) {
        setText(report);
        setError('Sharing is unavailable. Copy the report instead.');
      }
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setError('');
      setMessage('Report copied. Paste it into your message or email.');
    } catch {
      setError('Select and copy the layout report text.');
    }
  }
  return (
    <Show when={isReportDevice()}>
      <button type="button" disabled={busy()} onClick={share}>
        Share recent layout report
      </button>
      <p class="fine muted">
        If the bottom bar moved, send this to the person helping you. Only screen measurements and
        app events are included. Nothing is sent automatically.
      </p>
      <Show when={text()}>
        <button type="button" onClick={copy}>
          Copy report
        </button>
        <label>
          Layout report text
          <textarea readOnly value={text()} />
        </label>
      </Show>
      <ActionFeedback
        pending={busy() ? 'Opening share options…' : undefined}
        error={error()}
        message={message()}
      />
    </Show>
  );
}
