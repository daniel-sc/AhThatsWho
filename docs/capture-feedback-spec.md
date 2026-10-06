# Capture feedback

Agreed design for [#4](https://github.com/daniel-sc/AhThatsWho/issues/4) and [#5](https://github.com/daniel-sc/AhThatsWho/issues/5), authorized for implementation on 2026-10-06. Complexity includes implementation and focused verification.

## Settled: progress and actions (#4)

- Preserve automatic transcription → AI drafting → review; derive progress from existing capture state. Show distinct indeterminate waiting messages for transcription and AI drafting, then direct users to check each household and save. No wizard, percentages, or time estimates.
- On initial manual text entry, make “Process now” the primary action and “Save for later” secondary; order processing first.
- Hide unavailable processing/edit/save actions while requests run; retain “Keep for later” in review.
- Use “AI” rather than “OpenAI” for capture/review instructions, progress, and action labels. Provider-specific setup, billing, and privacy disclosures retain names where needed to explain the service or data destination.
- Verify text skips transcription, audio shows both waiting stages, actions match the current stage, and successful drafting leads to review/save guidance. Estimated complexity: **Low**.

## Visual flow and interaction

- Keep progress, errors and Retry beside their triggering action, following [the app-wide UX guideline](ux-guidelines.md). Per-card drafting owns feedback inside that card; whole-note processing owns feedback beside its controls and brings that area into view when removing old drafts. Use an indeterminate activity indicator, a plain stage label (“Transcribing your recording…” or “Preparing household suggestions…”), and brief guidance that review comes next and nothing has been saved to the notebook yet. Keep source text readable as it becomes available.
- At manual text entry, place the visually primary “Process now” before the secondary “Save for later.” After successful drafting, emphasize the household review heading and primary Save action, with guidance to check the suggestions before saving.
- During processing, hide unavailable edit, reprocess, and Save actions instead of presenting competing controls; retain the secondary “Keep for later” action. When idle but not ready to save, state what remains to resolve beside the disabled Save action.
- Place a single processing error and direct Retry action in the affected card or whole-note action area. Whole-note failure shows source without older cards; per-card failure clearly identifies the retained original suggestion.
- Reuse existing typography, spacing, button, notice, and card styles. Verify hierarchy and next-step clarity at mobile and desktop widths, keyboard access, and screen-reader status/error announcements. Estimated incremental complexity: **Low** within the existing changes.

## Settled: source excerpts (#5)

- Keep the per-card “Draft as new household” action for suggested updates and unresolved matches. Make it available whenever the card has any source excerpt; do not check excerpts against the source note or validate their attribution, coverage, or accuracy. Existing in-progress and source-correction safeguards still apply.
- Continue requesting source excerpts, but permit an empty excerpt list without rejecting otherwise usable drafts. Remove the evidence rejection; do not add normalization, semantic validation, automatic repair, or retry requests.
- Per-card drafting uses the supplied excerpts without supplying existing household facts; only the selected card is affected. Cards without excerpts can use manual editing or whole-note reprocessing.
- Whole-note reprocessing remains automatic, one household, or multiple households (at least two). No general selected-subset reprocessing is introduced.
- Verify nonmatching excerpts are accepted, the per-card action works with any excerpt, and other cards are preserved. Estimated complexity: **Low–Medium**, reduced from the previous conditional-validation option.

## Settled: whole-note reprocessing and failures

- Discard existing household drafts, including manual draft edits, when whole-note reprocessing starts. Preserve source text/transcript and local audio. This supersedes the retention policy in the earlier capture UX decisions for whole-note reprocessing.
- Successful processing shows fresh drafts for review; failure leaves the source and one inline error with Retry. Do not display earlier suggestions. Explain that retries can produce different suggestions from the same source.
- Clear obsolete draft/stage state together with starting the processing attempt; preserve existing concurrent-attempt and save safeguards. Show a processing failure once, avoiding duplicate capture/global alerts.
- Verify failures leave no earlier drafts, source survives, successful retry shows fresh drafts, and saving is unavailable without ready drafts. Estimated complexity: **Low**.

## Settled: per-card replacement failure

- “Draft as new household” preserves unrelated cards and retains the selected draft until replacement succeeds. After failure, show one error explicitly stating that the original suggestion remains, with Retry.
- Successful replacement changes only the selected card. Existing source-change, concurrent-attempt, and whole-capture save safeguards remain; no partial saving or missing-card state is introduced.
- Verify successful replacement leaves other cards unchanged, failed replacement preserves the selected draft and its edits, and retry remains available. Estimated complexity: **Low**.

## Implementation and verification

- Implemented with existing attempt guards and capture state; local retry metadata preserves the requested grouping or selected card across reloads and stays outside backups. Expected request failures are stored on the capture and displayed inline, without also raising a global alert.
- Production build/type checking, all 118 unit tests, and all 55 browser tests passed. Existing tests were strengthened for draft clearing before requests, source preservation after failure, and accepting nonmatching/empty excerpts; no new unit-test scaffolding was added.
- Manual Playwright walkthrough used synthetic households, mocked AI responses, and fake microphone audio at 320, 390, and 1280 px. Checked transcription → drafting → review/save, keyboard activation, reduced motion, no horizontal overflow, one error, whole-note clearing, and mode-correct/card-correct retries after reload; no page errors. Mobile inspection led to shorter entry copy and a smaller initial text area so the primary action is visible above navigation. Provider routing/data disclosure remains in expandable help.
- An independent reviewer without interview context found a missing processing data disclosure; it was restored in expandable help. Re-review found no remaining actionable findings. Browser checks establish application behavior, not live model accuracy or physical-iPhone behavior.
- Full-suite verification exposed an existing image-editor focus race: closing after Save focused the old button before the asynchronous list refresh replaced it. Focus restoration now waits for the saved version or a refreshed list, with search fallback if the person disappears. The existing browser test reproduces this regression and passed three consecutive focused runs after the fix; temporary focus probes were removed. Restarting the local preview server after rebuilding resolved stale-asset offline-cache failures.

Visual examples: [text entry](capture-feedback-visuals/390-text-entry.png), [transcription](capture-feedback-visuals/390-transcription.png), [whole-note failure](capture-feedback-visuals/390-whole-note-failure.png), [desktop review](capture-feedback-visuals/1280-review.png).

### Inline feedback follow-up — 6 October 2026

Feedback now belongs to its action rather than the top of the page. Per-card progress, failure and Retry stay inside the affected card; stable card positions preserve focus across proposal replacement. Whole-note processing brings its replacement feedback into view and then focuses the review heading. Save, source correction, playback and discard have local waiting/error feedback too.

Settings actions, recording and editor saving follow the same [app-wide guideline](ux-guidelines.md), using a small presentation component and screen-owned operation state. No notification queue or new unit-test framework was introduced. Browser coverage checks below-fold per-card progress, local error/Retry after reload, connection feedback/focus, and malformed imports retaining the notebook without a global banner.

Manual Playwright inspection used long synthetic household notes and mocked AI at 320, 390 and 1280 px: progress/failure/retry, Settings connection failure and file export, and sticky editor draft status. No horizontal overflow or page errors. Latest mobile examples: [inline progress](capture-feedback-visuals/390-inline-progress.png), [inline failure and Retry](capture-feedback-visuals/390-inline-failure.png).
