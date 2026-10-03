# Person image design decisions

Product design, library baseline, and OPFS local asset storage agreed through the interview. Implementation is authorized and tracked in [the verification record](verification.md); these decisions define its scope.

## Settled

### Optional inline layout follow-up (2026-10-03)

The design interview is complete and the user authorized implementation. These choices supersede the original card-layout and editor-entry restrictions below only where stated.

- Offer an optional inline layout in home/search results, disabled by default and remembered per installation rather than carried in notebook backups.
- When enabled, replace the right-hand household portrait with an image or placeholder before every person's name, including children and other household members. When disabled, retain the original card layout.
- Clicking an inline image or placeholder opens an image-only editor with its own Save/Cancel and add, replace, and remove actions. Outside the image button's hit area, clicking names or the remaining card opens household details.
- Keep image-editing code off the list's startup execution path. Loading the image-only editor and cropper together on image click is acceptable; prefer the simplest boundary over requiring a second load after file selection. Opening the list must not import or initialize the editor. Retain existing offline precaching; background caching is separate from executing editor code in the page.
- Setting label: “I'll sacrifice quick recognition to satisfy my completeness itch”. Supporting text: “Show a small picture or placeholder beside every name.” The smaller portraits trade recognition detail for showing a slot for everyone.
- Size inline pictures to the surrounding name text, with larger pictures for adult names and smaller pictures for children/other members. Prefer font-relative CSS sizing rather than measured or hard-coded per-role dimensions.
- Use an equally sized, quiet placeholder for a missing image: a subtle dashed outline and a faint silhouette of the existing “ah!” brand mark. It should read as empty without competing with names or real pictures. Slightly enlarge the image button's hit area without reserving extra layout space or increasing line height. It may overlap the name/card navigation area; the image action takes precedence there and must not also open household details. Keep separate image buttons accessible without nesting them inside a card button.
- Concurrent image edits use last-save-wins; no image-conflict resolution interface is required. The image-only operation should change only the selected person's image on the latest household record, preserving unrelated fields. This does not change concurrency rules for the existing full household editor.
- Save commits the staged image change. Cancel, Escape, or closing the editor discards it without an extra confirmation. Clicking outside the dialog leaves it open.
- A missing/deleted person or household must not be recreated by an image save; explain that the edit can no longer be saved.

No design questions remain open.

Implementation guidance from code inspection: reuse `ImageCropper` and the existing image asset pipeline. Extract the image picker/preview/remove controls currently embedded in `Editor` into a small shared component; keep household draft handling in the household editor and image-only Save/Cancel in a lazy-loaded dialog wrapper. The cropper already returns a staged asset ID without committing a household. Adjust its household-specific save explanation for each host, and make backdrop dismissal configurable in `ImageDialog` so the new editor follows the agreed dismissal behavior. Keep these editing components outside the list's static import graph.

### Original image feature

- Each person can have one identifying image, used to help recognize them.
- Users select an image through the device file/photo picker, with cropping supported so a person can be selected from a group photo.
- Show person images in household details and home/search results.
- Notebook data references a separate image asset store locally and in cloud backups. Deduplicate stored images rather than embedding copies in household revisions or every cloud snapshot.
- Images are included in notebook recovery. Manual exports and cloud-backup downloads package notebook JSON and referenced image files in a self-contained ZIP archive. Continue accepting existing JSON-only backups.
- Store only the cropped image, not the original source photo. Use a fixed square crop with drag and zoom controls.
- Store compressed portraits up to 1024 × 1024 pixels without upscaling smaller source crops. Generate and cache smaller disposable previews locally for household cards; exclude these derived previews from backups and regenerate them as needed.
- Process source images locally when the browser can decode them. Explain unsupported formats and ask the user to select a converted image; additional format-conversion dependencies are outside the first release.
- Add, replace, and remove images through the person editor, following existing household Save/Cancel behavior. Tapping an image in household details opens an enlarged view.
- Show one useful-sized portrait on the right of each household card: the first person with an image in household order. Do not show a name label on the card image or miniature images beside names. The image remains associated with its person, and household details expose each person's image. Households without images remain text-only.
- Target hundreds of people with compact portraits that remain clear when opened, rather than preservation of full photographic detail.
- Household History retains replaced or removed images; restoring an older household version restores its image.
- AI does not receive person images. Text-based AI updates must preserve their associations with people.
- Keep the existing automatic retention policy for notebook snapshots. Do not prune backed-up image assets automatically, and defer manual asset cleanup beyond the first release. Unused cloud assets may accumulate after snapshots expire.
- Defer local image asset cleanup too, accepting accumulation of unused assets. Export only the assets referenced by exported notebook content, including History, rather than the entire local asset store.
- Deduplicate cloud assets within each installation's backup history, not across histories. Restoring from another history must leave the new installation able to back up independently.
- Remove iCloud/CloudKit support for now. Google Drive and portable file recovery remain in scope; removing integration does not authorize deleting existing remote backups.
- Verify notebook JSON and all referenced images before reporting backup success. Download and verify all required images before replacing local notebook data during restore; missing or corrupt assets block replacement.
- Allow portable ZIP backups larger than the current 50 MiB limit. Enforce file-count and expanded-size safeguards, with practical limits determined during implementation testing rather than assuming the old JSON limit applies to the whole archive.

## Local asset storage and consistency

- Store local image files in OPFS; keep notebook records and asset references in the existing Dexie/IndexedDB database. Keep disposable preview files in a separate OPFS cache area.
- Assets are immutable and identified by the SHA-256 of their encoded bytes. Complete and close the file write and verify its content before committing a durable reference, including recoverable draft references. An existing filename alone does not prove a previous write completed successfully.
- Save the reference in the ordinary notebook database transaction only after the asset is ready. Failed or canceled operations can leave unreferenced files for later cleanup; they must not replace the previous saved image reference. Do not hold a database transaction open while encoding, hashing, or writing files.
- Coordinate attempts to publish the same asset across tabs; never overwrite a verified immutable asset with partial or different content. No cross-store transaction or immediate rollback of unused files is required.
- Restore follows the same ordering: stage and verify files first, then commit the notebook replacement. Preserve files referenced by the previous notebook's safety copy. Backups upload/verify assets before reporting a referencing snapshot complete.
- This deliberately relaxed policy accepts extra files, not knowingly incomplete referenced assets. Handle missing or corrupt files explicitly if they are later encountered; ordering is not an atomic durability guarantee across both storage systems.
- Local consistency integration is medium complexity with immutable assets and deferred cleanup; complete backup/restore remains high overall complexity.
- Do not assume equivalent read performance. Google's [storage guidance](https://web.dev/articles/storage-for-the-web) recommends OPFS for file-based content. [WebKit's OPFS explanation](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/) describes the efficient worker-only synchronous read path; that is not a benchmark of complete portrait display against IndexedDB Blob reads.
- Chromium's [documented IndexedDB Blob storage implementation](https://chromium.googlesource.com/chromium/src/%2B/master/content/browser/indexed_db/docs/README.md) stores persisted Blobs as separate files. Thus, a larger logical database does not necessarily mean image bytes are packed into one large database file. This implementation detail is not a cross-browser performance guarantee.
- A [Playwright CLI benchmark](person-image-storage-benchmark.md) compares persistent-profile Chromium, WebKit, and Firefox on Linux. Image decode times were broadly close, but WebKit showed a persistent slowdown reading an unrelated text table in the database that held assets (51 ms versus 4 ms in a separate text-only control). The cause is not isolated and these are not physical mobile results. The user selected OPFS following this evaluation; it is not claimed universally faster for image reads.

## Library baseline

- Use [Cropper.js v2](https://fengyuanchen.github.io/cropperjs/api/cropper-selection.html) for the square crop interaction, integrated through a small Solid wrapper. Integration complexity: medium, including image boundaries, touch interaction, and accessible controls.
- Use [@zip.js/zip.js](https://gildas-lormeau.github.io/zip.js/) for portable archives, using its stream and worker capabilities where appropriate. Integration complexity: medium; archive validation and resource limits remain application responsibilities.
- Use native Canvas APIs for portrait and preview encoding, and Web Crypto SHA-256 over final encoded image bytes for asset identifiers. Integration complexity: low. Deduplication is by identical bytes, not visual similarity.
- Keep [Pica](https://github.com/nodeca/pica) optional if native resizing proves visually inadequate. Additional integration complexity: medium; it is not part of the initial dependency baseline.
- Lazy-load cropping and ZIP code when needed. Pin compatible versions during implementation and verify phone-photo orientation, touch cropping, worker delivery, and large archive handling on mobile.

## Implementation follow-through

- Choose encoding settings, preview dimensions, and a card portrait size that supports recognition without crowding names on mobile.
- Verify scrolling and image memory behavior on target mobile devices. Load assets as needed rather than loading the entire image store with notebook records.
- Define and test archive validation and resource limits, including invalid references, unsafe paths, duplicate entries, oversized expanded content, and interrupted imports.
- Preserve asset references through text-based AI changes, household revisions, recoverable editor drafts, pending backups, and import safety copies. Canceled edits must not change saved image associations.
- Verify independent installation recovery, retry after interrupted uploads, destination changes, and legacy JSON imports. Mark backups complete only after verifying all required assets.
- Remove iCloud/CloudKit entry points and integration without deleting existing remote backups.
- Do not imply that removing an image erases historical or retained asset copies. No asset cleanup feature is included in this release; existing snapshot retention remains unchanged.
