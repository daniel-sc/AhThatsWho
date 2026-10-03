# Person images: implementation plan

Audience: a fresh Sol implementer at high reasoning effort. Implement the agreed feature end to end; this document is a plan, not a claim that implementation or visual verification has happened.

## Sources and scope

Follow-up note (2026-10-03): the authorized optional inline layout in [design decisions](person-image-design-decisions.md#optional-inline-layout-follow-up-2026-10-03) revises the original card presentation and adds an image-only editor entry point. The implementation sequence below describes the original feature and must not override those newer choices.

Read [design decisions](person-image-design-decisions.md), [ADR 0004](adr/0004-referenced-person-image-assets.md), and the existing [backup decisions](backup-design-decisions.md). They define behavior; do not reopen settled choices or duplicate them in another spec. The [storage benchmark](person-image-storage-benchmark.md) explains choosing OPFS without claiming a universal speed advantage.

The user wants pragmatic implementation and specs, meaningful tests only, an independent reviewer with no prior conversation context, and manual UI/UX checks using the Playwright CLI. The review and verification requirements apply to the finished implementation, not to this plan; all remain outstanding. Do not deploy or publish as part of this handoff.

## Approach and complexity

Build in the sequence below. The UI, cropper integration, and OPFS consistency are medium complexity. Cloud asset recovery and portable archives are high complexity because they cross existing persistence boundaries. Removing iCloud is low-to-medium complexity but touches bootstrap and backup state. Avoid a general attachment framework, a job queue, distributed transactions, asset garbage collection, face recognition, image conversion packages, or an unrelated UI redesign.

### 1. References, compatibility, and AI preservation

Start with `src/domain/types.ts`, `src/domain/integrity.ts`, `src/data/db.ts`, `src/backup/portable.ts`, and the capture/provider code.

- Add one optional image asset ID per person, using SHA-256 of final encoded image bytes. Keep image bytes and previews out of IndexedDB. Use a small asset descriptor in portable backup content when needed for validation; filenames are derived from validated IDs, never user input.
- Include the reference in validation, semantic equality, explicit portable-field copying, revisions, trash, and inbox proposals. An image-only edit must count as an edit and produce an ordinary revision.
- Version the portable format so old clients reject image-bearing backups instead of silently discarding their images. Preserve imports of both existing versions 1 and 2: the current `version === 1 || version === FORMAT_VERSION` check would accidentally reject version 2 after a bump. Inspect the coupling of database and portable versions before changing it; use the smallest safe migration, with no destructive reset.
- AI requests use an explicit text-only projection. Preserve images locally by stable person identity when reconciling generated updates against their checked base version. Do not let a model invent image IDs, silently drop existing images, or reassign another person's image. Preserve intentional manual image edits/removals in review drafts; do not blindly reattach old images at final apply. Keep existing stale-proposal/version conflict checks.

### 2. Small OPFS asset module

Add a narrow module under `src/data/` or `src/assets/`, separate from notebook storage. Expose only the operations callers need: store/ensure a verified immutable asset, read it, and obtain/regenerate its preview. No asset scanning during notebook startup or search.

- Use a dedicated OPFS directory for canonical images and a separate area for disposable previews. Resolve the root lazily on the client. Keep DOM/storage APIs out of server-side module initialization.
- Encode a square crop up to 1024 pixels without upscaling. Native JPEG is a reasonable initial output format for portraits; select one encoding policy and normalize input rather than preserving arbitrary source formats. Start with ordinary photographic quality and adjust only on visible evidence.
- Hash the final encoded bytes. For a new asset, await write and close, reopen and verify the hash, then allow any durable notebook or draft reference to be committed. Existing filenames are not sufficient proof of completeness. Reuse valid existing assets.
- Serialize publication of a given asset across tabs, using a small per-asset Web Lock or an equally simple safe mechanism. Do not overwrite a verified canonical asset. Avoid putting encoding, hashing, OPFS I/O, or network work inside an IndexedDB transaction.
- A failed write keeps the previous saved image. A later canceled edit or failed database commit may leave a file behind; that is accepted. Do not add rollback journals or cleanup scans.
- Handle unsupported OPFS, unsupported input images, write/quota failures, and missing/corrupt stored assets with a useful error. Keep notebook text accessible. Do not introduce a second permanent storage backend as an automatic fallback.
- Previews are derived and regenerate on demand; canonical-image success must not depend on preview creation. Limit parallel decode work and release object URLs when the consuming UI is disposed or its image changes.

### 3. Person editor and household presentation

Primary surfaces: `src/ui/Editor.tsx`, `src/ui/HouseholdView.tsx`, `src/ui/HouseholdList.tsx`, and `src/style.css`.

- Lazy-load Cropper.js v2 in a small Solid wrapper. Fixed square crop with drag/zoom, clear confirmation/cancel, keyboard-usable controls, and sensible framing from a group photo. Stay within image bounds. Add no live camera, face detection, or original-photo retention.
- Stage the finished OPFS asset before writing the image ID into recoverable editor state. Household Save/Cancel retains its existing meaning; removing an image clears the association only.
- A household card has one useful-sized portrait on the right: first person with an image in household order, no visible name label, no mini portraits beside names. No image means text-only. Preserve card-wide navigation rather than adding a nested image button. Reserve image dimensions to prevent list jumps; keep names and memory cues readable at narrow widths.
- Household details show each person's image clearly associated with that person. Tapping opens a simple enlarged view with proper close/focus behavior. Use accessible image text even though the card has no visible name label.
- Keep History, trash, and proposal/review surfaces consistent with their actual saved/draft references. Do not accidentally show today's image for an older revision.
- Treat portrait size and spacing as visual implementation choices. Start around 80–96 CSS pixels on the card and inspect before settling; do not force a rigid spec that makes names unreadable.

### 4. Portable ZIP export/import

Extend `src/backup/portable.ts` or split archive handling into a focused companion module. Integrate both Settings exports and Drive-history downloads.

- Use `@zip.js/zip.js`. A simple layout is `notebook.json` plus `assets/<sha256>.<fixed-extension>`. Include each canonical asset once, collecting references from exactly the exported notebook: households including trash, revisions, and inbox proposals. Exclude unsaved editor metadata, unrelated OPFS files, source photos, and preview caches.
- Preserve existing JSON imports. ZIP import validates metadata and every required image before replacing notebook data. Stage valid files first; then use the existing database replacement/safety-copy transaction. Import failures may leave unused files, but must leave the active notebook unchanged. Do not clear OPFS on import or safety recovery.
- Accept archives above 50 MiB. Keep notebook-JSON limits separate from archive limits. Define a few centralized limits for archive bytes, expanded bytes, file count, and individual images. Start conservatively above 50 MiB (e.g. a 256 MiB archive/expanded budget), adjust based on the real archive trial, and show the enforced limit in errors. Do not implement unbounded extraction or load all expanded images into memory at once.
- Require a bounded allowlisted layout, unique entries, valid hashes, and matching content. Reject unsafe/duplicate paths, missing assets, corrupt images, and expansion exceeding the actual running budget; declared ZIP sizes alone are insufficient. A small number of table-driven cases covers this boundary.
- Stream entries with bounded concurrency. Already-compressed portraits can be stored without recompression. A final download Blob may still occupy memory: do not claim constant-memory downloads merely because zip.js supports streams.
- Serve any worker/WASM assets from the app origin under its existing CSP. Verify the built app offline; do not broadly relax CSP to make a library work.

### 5. Google Drive assets and verified backups

Primary files: `src/backup/contracts.ts`, `src/backup/coordinator.ts`, `src/providers/drive.ts`, `src/server/drive-storage.ts`, `src/app/backup.ts`, and `src/ui/DriveBackup.tsx`.

- Keep the existing per-installation history, authentication, origin/account boundaries, generation guards, and snapshot retry model. Add the minimum asset upload/read/verification capabilities needed; no new cloud provider framework.
- Store binary image assets separately in Drive app-data, identified by hash and owned by one installation history. Distinguish asset records from snapshots/history records. Filter list operations so thousands of assets do not become thousands of visible backups.
- Use binary request/response bodies for assets and bounded per-file handling; do not base64-embed image bytes into JSON. The backend retains credentials/metadata only and does not intentionally persist or log image payloads.
- Upload and verify every required asset before publishing a complete referencing snapshot. Reuse verified remote assets within that history, with idempotent retry after lost responses. A partial attempt can leave extra files; it cannot advance the verified-backup counter. Avoid redownloading every historical image on every ordinary backup once its remote bytes have been verified, while rechecking required files on restore.
- Restore/download resolves assets from the selected snapshot's history. Restore into another installation stages local files; subsequent backups upload/reuse assets owned by the destination history. Never leave a destination backup dependent on another history that can be deleted.
- Retain existing notebook snapshot pruning. Automatic pruning must never select asset records. No manual asset cleanup feature. Existing explicit whole-history deletion may delete that history's assets because histories share no assets; preserve its existing user confirmation and ownership checks.
- Drive snapshot download must assemble a self-contained ZIP, not export a JSON file with dangling image references. Existing JSON-only snapshots remain readable.
- Do not mark backup success until required files and JSON are verified. Preserve pending changes made while an upload is running, and ignore obsolete completions after account/dataset switches.

### 6. Remove iCloud without deleting data

Remove CloudKit UI/bootstrap/provider/config plumbing; update privacy copy, README/deployment documentation, relevant CI environment wiring, and Apple-only CSP allowances. Shared backup types belong in `src/backup/contracts.ts`, not the removed provider.

The user clarified during implementation that iCloud was never used, so no persisted-destination compatibility migration is required. Remove that integration and its dedicated tests; retain shared backup coverage and fix its imports. Drive connection and authorization remain explicit. Removing the integration does not delete any local notebook content or remote data.

## Automated checks: value before quantity

Run existing type checks, relevant tests, and the production build. Run the existing E2E suite appropriate to these changes after the feature is integrated. Do not add tests for CSS values, component internals, library behavior, one-line helpers, trivial snapshots, or every permutation of UI states.

Add/extend only tests protecting a meaningful failure boundary:

1. **Reference lifecycle and AI preservation:** image-only edit/history restoration; text AI update preserves the correct image; intentional review removal is not undone. Protects silent loss or reassignment.
2. **Portable recovery:** ZIP round-trip including historical assets and old JSON compatibility; representative missing/hash-mismatched/over-budget archive failures leave the active notebook unchanged and its safety copy usable. Protects the recovery promise.
3. **Cloud boundary:** interrupted upload cannot mark success; a verified asset is reused; snapshot pruning leaves assets; installation/account boundaries and stale completions stay correct. Prefer extending existing coordinator/Drive tests over inventing parallel mock infrastructure.
4. **Actual OPFS lifecycle:** one focused persistent-browser integration scenario for write-before-reference, failed save/cancel, and reload/reopen. Test the genuine storage API where an in-memory fake would conceal the failure mode. Cover same-asset concurrent publication only if the chosen implementation contains meaningful race logic.

These are risk categories, not a quota or a demand for separate suites. Reuse existing tests and fixtures; prefer a few behavior-level cases. Explain any new test in terms of the failure it prevents.

## Manual UI/UX verification with Playwright CLI

This is required after implementation, in addition to automated checks. Use the CLI (`npx playwright test ...`, and CLI screenshot tools where useful), real interactions, synthetic images, and persistent browser profiles for OPFS. Temporary exploratory scripts may live in `/tmp`; do not turn every visual check into permanent E2E coverage.

- Start a production build/preview locally. Inspect narrow mobile (~390 px), very narrow (~320 px), and desktop layouts. Exercise available Chromium and WebKit engines; Linux WebKit and mobile emulation are not a physical iPhone claim.
- Create synthetic households with no images, one image, several imaged people, a child as the first imaged member, long names, and long memory cues. Include a group photo or synthetic composition suitable for cropping. Do not use private contacts/photos.
- Actually choose a file, frame a person, zoom/drag, accept/cancel the crop, Save/Cancel the household, replace/remove an image, reload, and view the enlarged image. Check focus, keyboard controls, touch-sized buttons, and the relationship between the selected image and the editor row.
- Inspect screenshots yourself with an image viewer. Check portrait prominence, image/name balance, crop controls on small screens, wrapping/overflow, empty states, loading jumps, dialog dismissal, and visual consistency. Fix discovered issues and repeat affected checks; passing locators alone is not visual approval.
- Scroll a populated image list, search, inspect old History and trash, reopen offline, and perform a local ZIP recovery into a fresh profile. Exercise invalid input and a failed/unsupported storage path without damaging the active notebook.
- Check built-app console/network/CSP errors, image URL cleanup, and lazy loading. Save a small set of before/after screenshots and a concise record of browsers, viewport sizes, flows, fixes, and remaining limits.
- Real Drive round-trip verification needs an authorized test account. If unavailable, use existing server/transport test seams and clearly report that the live-provider path remains unverified; never imply mocks prove Google authentication or storage works.

## Independent review and completion

After implementation and first validation, spawn a new reviewer with `fork_turns: "none"`. Do not reuse the planning reviewer or a contributing implementer. Supply only repository location, the fixed base/diff range, and paths to the design/ADR/plan. Ask neutrally for correctness, data integrity, spec adherence, and unnecessary complexity. Do not supply expected findings, a defense of the implementation, or a checklist of pet bugs. The reviewer must inspect the code independently.

Address actionable findings, rerun only affected checks, and complete the manual visual pass on the final UI. Final delivery reports what changed, meaningful test results, visual evidence, review findings/fixes, and material unverified items. No production deployment or remote backup deletion is part of this task.
