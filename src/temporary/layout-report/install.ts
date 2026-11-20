import { createRoot, onMount, onCleanup } from 'solid-js';
import type { Screen } from '../../app/view-state';

export function isReportDevice() {
  return (
    typeof window !== 'undefined' &&
    /iPhone/.test(navigator.userAgent) &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function installLayoutReport(screen: () => Screen) {
  onMount(() => {
    if (!isReportDevice()) return;
    let closed = false;
    let stop = () => {};
    onCleanup(() => {
      closed = true;
      stop();
    });
    void import('./recorder')
      .then(({ startLayoutReport }) => {
        if (!closed)
          stop = createRoot((dispose) => {
            onCleanup(startLayoutReport(screen));
            return dispose;
          });
      })
      .catch(() => {
        /* Optional diagnostics must not interfere with the notebook. */
      });
  });
}
