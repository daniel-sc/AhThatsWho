---
status: accepted
---

# Allow one capture to produce several household changes

A capture is a source note that may produce one or several household creations or updates. The design lets the model choose initially, offers explicit reprocessing as one or multiple households from the source, and saves all reviewed changes together or none. This reduces repeated capture and avoids a persistent behavior setting, accepting some precision loss and best-guess grouping even when boundaries are unclear; uncertainty remains visible and users can correct the source and reprocess.

Keeping one household per capture would preserve a simpler data model, while independently saving each proposed household would require tracking partial completion. The selected direction has high overall complexity and changes the meaning of persisted captures and their completion records, so reverting after adoption would require handling captures associated with several households. The design was agreed on 2026-10-01; implementation is complete, with live precision evaluation still pending. Detailed choices, the selective use of medium reasoning for explicit multiple-household reprocessing, and the precision evaluation plan are in [Capture and context UX](../capture-ux-decisions.md#multiple-households-per-capture--agreed-design).
