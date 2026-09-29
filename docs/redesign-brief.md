# AhThatsWho — Margin notes

Status: G / Margin notes selected by the user and implemented, 29 September 2026.

## Agreed constraints

- Preserve the AhThatsWho name and exact approved handwritten “ah!” logo.
- Preserve all nine views: Home, Household, Editor, History, Trash, Capture, Inbox, Review, and Settings. Keep Home / Capture / Inbox navigation and the Settings entry in the header.
- Home must support fast scanning and lookup while distracted. Rearrange content only for a concrete usability reason.
- Color is open. Put personality into names and composition while keeping supporting controls readable.

## Selected design

After rejecting the conventional blue-and-peach first pass, the user selected the Hello again mood board. They then selected the coral header from A and open list from B, requested E's compactness with F's playfulness, and chose **G / Margin notes**.

The visual system combines a coral header, white search field with a cobalt offset edge, continuous household rows, a slim cobalt notebook margin, expressive blue first names, and clearly readable surnames. Each adult keeps their own full name. Context labels sit beside household members; cues and matching note excerpts remain visible underneath. No record text is truncated.

The Home title remains available to assistive technology but does not consume a separate visual row. The Add household control sits in the results toolbar. Search and context filters retain their behavior. The remaining views use the same header, typography, colors, control shapes, and notebook margins, with their existing content and actions.

| Role                                    | Value            |
| --------------------------------------- | ---------------- |
| Header / identity background            | Coral `#ff624f`  |
| First names / primary actions / margins | Cobalt `#163bee` |
| Body text                               | Ink `#161616`    |
| Main canvas                             | Paper `#fffefb`  |
| Supporting text                         | `#56524c`        |
| Search matches                          | Yellow `#ffcc57` |
| Destructive actions / recording         | Red `#aa283b`    |

Bricolage Grotesque carries expressive names and headings; Atkinson Hyperlegible Next carries surnames, details, controls, and forms. Both families and their SIL Open Font Licenses are bundled locally and precached. The logo artwork is unchanged; installation icon backgrounds and browser theme color use coral.

## Prototype archive

All nine experiments, the mood boards, exact generation prompts, and the selection verdict are preserved on local branch `prototype/hello-again-exploration`, commit `aa8c1f7`.

The selected [G screenshot](../design/moodboards/selected-g.png) remains as a design reference. The temporary route, switcher, fixtures, and prototype command have been removed from the production working tree. The design was implemented in the real components rather than shipping the prototype.

To inspect the source later:

```sh
git show prototype/hello-again-exploration:design/prototype-verdict.md
```

There is no implementation issue linked to this session; this document is the decision record.

## Preserved behavior

Search and filters, global fallback, whole-household rows, list virtualization and scroll restoration, drafts and explicit saving, review/apply safeguards, history and trash, keyboard focus, reduced motion, mobile safe areas, and offline operation remain in place. Missing names, surname-only records, name certainty markers, multiple contexts, and search excerpts remain visible.

## Verification

- Type checking and production build passed; all 35 unit tests and all 20 browser journeys passed.
- Browser journeys cover edits/history/trash, import and recovery, drafts, offline reload, service-worker updates, provider failures, recording, review/apply, and large-list scroll restoration. A new regression check covers partial/unknown names, uncertainty markers, multiple contexts, long names, and matching note excerpts.
- Ten screen states were checked at 320, 390, 768, and 1280 px without horizontal overflow or page errors. Screenshots were inspected for empty/populated lookup, household details, editor, capture, inbox, review, history, import, and settings.
- Sampled contrast: primary actions and active navigation 7.26:1; supporting copy 7.69:1; search highlights 12.09:1. Visible keyboard focus and recording appearance were inspected. Reduced-motion handling remains in place.
- Both font families loaded after an offline production reload.
- Synthetic Chromium measurements: 500 households reloaded to names in 363 ms; 5,000 in 561 ms. Direct search input event to paint was 19 ms and 36 ms respectively. These are Linux viewport-emulation observations, not physical iPhone measurements or measured human lookup speed.

No deployment was performed as part of this redesign. Physical Safari/iPhone and live-provider limitations in [the beta verification record](verification.md) still apply.
