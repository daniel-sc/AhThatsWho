# Temporary iPhone layout reports

On an installed iPhone, open **Settings → Feedback → Share recent layout report** after the bottom bars drift. Send the text to the person investigating via Messages or Mail; Copy report is available when native sharing is unavailable. The report contains time-stamped measurements, not notebook data. No automatic upload, permission prompt, backend or migration.

The recorder passively samples navigation-bar and editor-action geometry, viewport dimensions, focus and app lifecycle. In portrait it keeps a healthy same-width reference so a simultaneous drop in both viewport heights can be detected. An unfocused, unzoomed displacement of at least 48 CSS px flags a _candidate_, not a diagnosis. Compare the preceding healthy rows, focus/resume timing and reported geometry with the user's observation. Settings activity does not displace the evidence. If no candidate is detected, recent rows are still shareable.

Storage is bounded to 29 samples under one localStorage key (`ahthatswho:layout-report:v1`); rows older than a week are discarded when read. It is independent of IndexedDB, backup and analytics. If storage is blocked/full, reports still work until the app is closed. iOS can terminate an app before a buffered routine write; the first detected episode is saved immediately.

**Removal:** remove the recorder import and mount hook from `src/app/App.tsx`, the share-control import and usage from `src/ui/Settings.tsx`, this directory, and `e2e/layout-report.spec.ts`. To erase residual samples on returning installations, temporarily call `localStorage.removeItem('ahthatswho:layout-report:v1')` on startup in a guarded `try/catch`. No service or schema needs rollback.
