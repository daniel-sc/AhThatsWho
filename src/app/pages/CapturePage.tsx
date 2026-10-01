import { usePage } from '../page';
import { CapturePanel } from '../../ui/CapturePanel';

export default function CapturePage() {
  const { ui, setReturnToCapture, setRecording, report, navigate, setNotice } = usePage();
  const captureHints = {
    householdId: ui().previous === 'household' ? ui().target : undefined,
    contextId: ui().context || undefined,
  };
  return (
    <CapturePanel
      setupAI={() => {
        setReturnToCapture(true);
        navigate('settings');
      }}
      hints={captureHints}
      close={() => navigate(ui().previous || 'home')}
      saved={() => {
        navigate('inbox', { completed: false });
        setNotice('Saved to Inbox. Review it whenever you’re ready.');
      }}
      review={(id) => navigate('review', { capture: id })}
      error={report}
      recording={setRecording}
    />
  );
}
