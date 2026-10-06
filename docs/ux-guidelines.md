# Action feedback

Progress, results, errors and recovery controls belong beside the action that caused them. This is the default across the app, including mobile layouts.

- Keep feedback inside the affected household card, form, settings action or backup row. Identify what is processing. Put Retry beside its error; retain useful input and drafts on failure.
- Keep feedback visible from the position where the action was clicked. A message at the top of a long page is insufficient. Prefer inline feedback over sticky banners or temporary toasts.
- Preserve the action area's DOM and focus when switching to progress or replacing a suggestion. Use polite status announcements and alerts for errors; do not announce the same result in multiple locations.
- If the action removes its section, explicitly bring the replacement progress into view, then guide users to the result. Whole-note reprocessing follows this rule because it discards the old suggestions.
- Reserve the global error banner for failures without a useful local owner. Errors from a form or a specific request should not send users to the top of the app.
- Reuse `src/ui/ActionFeedback.tsx` for presentation. Keep operation state with the owning screen; no global notification queue or generic task framework is needed.

Verify long content at mobile widths: trigger actions below the fold, wait for success and failure, retry, and check focus and visible feedback. Add browser coverage for meaningful regressions; presentation-only unit tests add little value.
