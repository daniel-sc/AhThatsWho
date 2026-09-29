# UX review — 29 September 2026

This review records the earlier black-and-yellow iteration. The subsequently selected and implemented design is [Hello again / Margin notes](redesign-brief.md); that brief supersedes the visual direction below.

Direction: boldness and reduction, consistent with the selected black-and-yellow Aha identity.

## Findings and changes

| Finding                                                                       | Resolution                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thin outlines and separators dominated the interface.                         | Removed decorative rules and fieldset frames. Use space, filled controls, and white groups; retain strong edges for focus, checkboxes, and important notices.                                       |
| Arbitrary household colors and tiny bordered tags competed with names.        | Removed color stripes; increased name and tag legibility and grouped each household on a simple surface.                                                                                            |
| Search, settings, row arrows, and navigation used inconsistent glyph weights. | Standardized SVG icons and heavier strokes; gave settings a solid, clearly tappable control.                                                                                                        |
| Small filters and checkbox rows were awkward on phones.                       | Increased targets to 48 px, enlarged checkbox artwork, and arranged recognition languages in two columns.                                                                                           |
| Capture instructions pushed the note field below the fold.                    | Removed duplicate introductory text and the redundant focus button, shortened guidance, and brought the text field and actions forward. External processing and audio-retention disclosures remain. |
| Optional certainty selectors made ordinary edits visually dense.              | Collapsed unmarked certainty controls. Existing uncertainty opens automatically; selection does not unexpectedly close the control.                                                                 |
| Editor actions consumed too much of the phone viewport.                       | Compact two-column sticky save/discard controls, above navigation.                                                                                                                                  |
| Action hierarchy and selected-state semantics were inconsistent.              | Strengthened the review action, made import a secondary empty-state action, added pressed/current state semantics, and kept Home selected for household subpages.                                   |
| Backup status lacked context and competed with the wordmark.                  | Removed the small tagline; labeled backup status and placed it on a readable separate line on phones.                                                                                               |
| Larger rows exposed native scroll anchoring competing with virtualization.    | Disabled native anchoring within the measured list; verified deep scrolling, returning from details, and reload restoration.                                                                        |

## Verification

Walked through empty home, populated home, capture, inbox, review, settings, import preview, household details, editor, and history using synthetic data. Checked horizontal overflow at 320, 390, 768, and 1280 px and visually inspected the mobile captures. Verified optional certainty selection and reopening. Production build, unit suite, and browser journeys cover the changed flows, including offline behavior, service-worker updates, draft handling, and virtualized-list restoration. Browser checks use Chromium; physical iPhone behavior is not established by this review.
