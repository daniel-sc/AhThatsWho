# Capture and context UX

Date: 2026-09-30. Design approved and implemented in the working tree; not deployed by this change.

Primary goal: great UX with low complexity. Complexity estimates include implementation and verification.

## Agreed direction

| Topic           | Decision                                                                                                                                                                                                                | Estimated complexity |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| New contexts    | Create only through an explicit UI action. AI may propose assigning existing contexts for review, but must not create contexts from mentions or spoken instructions.                                                    | Low                  |
| Capture scope   | Keep one household per capture. Explain this beside the input, including that multiple people from the same household are allowed.                                                                                      | Low                  |
| Context filters | Show all contexts in a horizontally scrollable row; remove More. Favorites first, stable ordering, visible scroll affordance, and keep the active context visible when opening. No additional context search initially. | Low                  |
| Feedback        | Email to `hello@ahthatswho.com` is the primary feedback route; GitHub is a secondary route for issues and discussion.                                                                                                   | Low                  |

## New household alternative

Always offer a new-household alternative when reviewing a suggested assignment to an existing household. It must retain information from the capture. Generate an independent new household draft from the source; do not derive it from a merge draft, which can contain existing household facts.

Generate the independent new household draft in a separate request when the user selects the new-household alternative. Use the original capture text/transcript and available contexts without supplying candidate household facts. Keep the previous proposal while loading and if the request fails; allow retry. Review the new draft before saving. Estimated complexity: medium.

Including both drafts in the initial response was considered: it enables immediate switching but requires a broader proposal format and persistence changes and generates unused alternatives. On-demand generation was selected to keep complexity lower, accepting an additional wait and possible request failure.

## Feedback routing status

On 2026-09-30, Cloudflare Email Routing and its DNS records were enabled. After the destination was verified, the forwarding rule for `hello@ahthatswho.com` was created and confirmed enabled through the API. Routing reports ready. End-to-end delivery to the destination inbox has not been tested.

## Implementation and verification

- New contexts remain available through explicit creation in Settings or the household editor. AI output is restricted to existing contexts. Older proposals containing context suggestions require reprocessing before applying; no contexts are silently created.
- Review offers **Draft as new household** for suggested updates and ambiguous matches, with a loading status and the existing manual fallback. The on-demand request works through sponsored AI and personal keys without a new stored proposal format.
- Home displays every context in one scrollable row, favorites first and alphabetical within each group. Edge shading indicates overflow. Opening Home or selecting a context brings the active button into view without moving the page vertically.
- Capture explains the one-household scope. Settings contains the feedback email link and a secondary GitHub issues link.
- Type checking/production build passed. All 65 unit cases passed across the suite and the targeted rerun after fixing a test fixture. Added focused checks for independent draft inputs, the Worker mode boundary, and blocking legacy context creation.
- All 28 existing Playwright journeys passed. Two temporary browser walkthroughs additionally verified loading/failure/retry/apply for a new draft, preservation of the original household, ambiguous-match access, legacy proposal handling, explicit context creation, feedback links, horizontal scrolling and selected-context restoration. Temporary walkthrough code was removed after verification.
- Screenshots were inspected at mobile widths; layout checks covered 320, 390, 768 and 1280 px. Browser checks used Chromium and mocked model responses, not physical iPhone or live-model evaluation.

Terminology lives in [CONTEXT.md](../CONTEXT.md). These reversible UX decisions do not currently warrant a separate ADR.
