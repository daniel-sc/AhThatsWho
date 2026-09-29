# Welcome prototype verdict

Question: how should a fresh notebook explain its value and invite a first entry?

Selected: B, story first, with equally prominent cobalt manual-entry and coral AI voice/text actions. Fictional example stays outside notebook data. Import/restore and installation remain secondary. Approved for implementation on 29 September 2026.

Prototype: `prototype/onboarding-story-first`, route `/?prototype=onboarding&variant=B`, run `npm run dev`. A and C preserve the alternative hierarchies. No originating issue exists; this document is the context pointer.

Implemented as production Welcome and InstallHelp components; prototype route and switcher removed. Archive commit: `2ef6f9d`. Existing notebook, drafts, inbox, trash, and empty search results must not be mistaken for a fresh notebook.

## Implementation and verification

- Equal-size manual and AI capture actions; capture links to AI setup and back without losing the draft.
- Examples are static display content, never notebook records. Fresh-state detection waits for database loading and excludes households (including trash), contexts, inbox, history, audio, drafts, and previously changed/restored notebooks.
- Installation is an optional disclosure on welcome and in Settings. Uses the native prompt when offered, otherwise browser instructions; hides in installed mode. No automatic popup.
- Production build and 37 unit/integration tests passed. All 24 browser journeys passed, including welcome-to-save, empty search results, draft-preserving AI setup, installation prompt dismissal/completion, and import navigation.
- Chromium visual checks at 320, 390, 768, and 1280 px found no horizontal overflow; both main actions have equal height and width. No physical iPhone installation or live AI request was tested.

Final copy explicitly states that the notebook is stored on this device and explains what optional AI sends to OpenAI. No additional backup prompt was added. Before release, complementary welcome/lookup conditionals were combined, and redundant installation busy state was removed: consuming the single-use browser prompt already removes its button and prevents repeated activation.
