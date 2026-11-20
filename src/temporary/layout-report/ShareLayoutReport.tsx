import { createSignal, Show } from 'solid-js';
import { ActionFeedback } from '../../ui/ActionFeedback';
import { isReportDevice, layoutReportText } from './recorder';

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
      } else setText(report);
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
      setError('Select and copy the report text below.');
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
      <ActionFeedback error={error()} message={message()} />
    </Show>
  );
}
