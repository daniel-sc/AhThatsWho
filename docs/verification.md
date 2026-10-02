# Beta verification record

Recorded 27 September 2026. Build `0.1.0-beta.1`; format 1. The recorded test build was made before Git initialization and is marked **uncommitted-at-build-time**. The implementation is now tracked in a local Git repository; use `git log` for the current commit. Git access in the managed coding environment requires execution outside its sandbox. See `build-record.json` for the verified asset fingerprint. Environment: remote Linux x86_64, mise Node 24.21.0, Chromium through Playwright 1.63.0, 390 px iPhone-13 _viewport emulation_. **No actual iPhone was available.**

**Release status: beta candidate; full personal beta blocked on operational configuration and real-device validation.** Software integration paths exist, but mocked responses and browser emulation do not establish real-provider/device success.

## Completed evidence

### Person images — 2 October 2026

Implemented person images through editing, recognition cards, details, History, trash, inbox proposals, portable recovery and Drive backups. Implementation checks used local previews; no production deployment or remote-data deletion was performed. Tests and screenshots use synthetic people and images only.

- `npm run check`, `npm test` (**115 tests**) and the production build pass. Meaningful new coverage protects image-only revisions, AI identity preservation and intentional review removal, archive failures without notebook/safety-copy replacement, and verified cloud assets before snapshot completion. Archive unit tests mock browser decoding/OPFS; persistent-browser checks exercise the real APIs.
- All **50 Chromium browser journeys** are covered by successful runs: the broad run passed 49 and had one artifact-folder collision during concurrent checks; that Drive case passed in isolation. Final affected Drive/editor journeys and seven image/recovery/offline/lazy-route journeys passed after integration. The persistent OPFS scenario verifies staging before recoverable drafts, failed publication, household Cancel, reload/reopen, enlarged-image focus, and ZIP recovery into a fresh profile.
- Playwright CLI manual checks used persistent Chromium and WebKit profiles at **390 × 844**, **320 × 740** and **1100 × 900**. Actual picker/crop drag/zoom/keyboard/confirm/cancel, image replacement/removal, household Save/Cancel, enlarged view/focus, long names/cues, no-image rows, child-first portraits, multiple imaged people, older History images, trash, and a populated 91-household scroll/search were exercised. Synthetic EXIF orientation 6 JPEGs decode upright and crop correctly in both engines. Object URLs are released on route/reference disposal; Chromium ended the populated/offline flow with one live display URL.
- Direct screenshot inspection found crop confirmation clipped on the very narrow layout. A shorter crop area and three-column controls retain 48 px buttons and make the full dialog visible. Evidence: [before](person-image-visuals/320-crop-before.png), [after](person-image-visuals/320-crop-after.png), [WebKit](person-image-visuals/320-webkit-crop.png), [mobile list](person-image-visuals/390-list.png), [details](person-image-visuals/390-detail.png), [multiple portraits](person-image-visuals/390-multiple-images-detail.png), [first imaged person on card](person-image-visuals/390-multiple-images-card.png), and [desktop](person-image-visuals/desktop-list.png).
- A real built-app trial exported and restored **85 JPEGs**, **58,094,303 ZIP bytes (55.4 MiB)**, through actual OPFS and the replacement UI, then reloaded successfully. This exposed Chromium's native `Response(stream).blob()` accumulator canceling with an undefined error after about 10 MiB. ZIP output now uses a bounded writable sink; the same original trial passes without diagnostic overrides, and a regression reproduces the failing native consumer before the fix. The final download Blob still occupies memory.
- A fresh, unprimed reviewer inspected the full diff and independently passed 84 focused tests. The final archive change passed another independent 10-test review and forced output-limit probe. One minor finding—failure guidance hidden by a disabled portrait button's accessible name—was fixed with a conditional parent label. No outstanding correctness/data-integrity findings were reported.
- Portable format is **3**, accepting legacy JSON formats **1 and 2**; IndexedDB schema remains **2**. Canonical square JPEGs are capped at 1024 px without upscaling (quality 0.82); previews are disposable 192 px files. SHA-256 IDs, per-asset Web Locks, write/close/reopen verification, and file-before-reference ordering accept unused files after cancellation rather than adding rollback or cleanup machinery.
- Archive limits are **256 MiB compressed**, **256 MiB expanded**, **50 MiB notebook JSON**, **5 MiB per portrait** and **10,000 entries**. Imports count actual streamed output, reject unsafe/duplicate/unreferenced/missing/corrupt entries, and stage files before notebook replacement. Export includes exactly saved household/trash/revision/inbox references, excluding drafts and previews. Cropper and ZIP code are lazy, precached, and served from the app origin; CSP was narrowed when Apple integration was removed.
- Drive uploads and verifies history-owned binary assets before publishing a complete snapshot. Verification metadata tracks immutable Drive file versions; restores rehash bytes. Pruning selects snapshots only, and deleting another complete history includes its owned assets. Apply [migration 0003](../migrations/0003_drive_asset_verification.sql) before deployment. Backend/transport tests use synthetic responses and SQLite, not a live Google account.
- iCloud provider, bootstrap, Settings controls, configuration, dedicated tests, CI variable and Apple-only CSP permissions were removed. Per the user's clarification, no backward-compatibility migration was added because the integration was never used.

Chromium also passed offline reload, new local cropping and the first lazy ZIP export with no console/CSP errors. Linux WebKit online image flows and populated precache passed, but its offline cold navigation returned an internal engine error; a request-abort alternative reported “Blocked by Web Inspector.” Its offline navigation remains unverified in this Linux harness.

Remaining limits: no authorized live Google account, physical iPhone/Android, real HEIC conversion or mobile memory/performance trial was available. Synthetic EXIF and Linux WebKit do not establish actual phone-photo behavior. Local/cloud unused image cleanup remains deliberately deferred; removing a portrait does not erase historical or retained copies. Preview hot rebuilding briefly produced stale hashed-asset responses; final checks use a restarted preview with a consistent asset manifest.

### Sponsored AI addition — 29 September 2026

- `npm run check`, `npm test` (**60 tests**), and `npm run build` passed. Worker tests mock OpenAI and cover fixed request options, bounded bodies, transcription forwarding, missing credentials and sanitized upstream failures.
- Production-build browser suite: 25/27 passed initially; two test setup/selector failures were corrected, then both affected files (5 journeys) passed. All 27 journeys are covered by the successful runs. Sponsored voice/transcript retry and explicit BYOK switching are included; no live inference occurred.
- Wrangler deployment dry run passed (Worker bundle plus static assets). Local workerd smoke passed for static assets, API routing including navigation requests, no-store headers, unknown routes and missing-secret 503 responses.
- Deployed source `2773bf0` to `ahthatswho` on 29 September 2026; Cloudflare version `2efc28d7-0af3-4ece-a8a6-b605a8cd06cb`. Preserved the existing repository CloudKit build configuration. Production smoke verified the new app (HTTP 200 with CSP) and Worker API (no-store HTTP 503: sponsorship secret not configured), without inference.
- No OpenAI key exists in the local environment or `.dev.vars`, and no platform budget change was made. The Worker script is now deployed, so Cloudflare can accept the runtime secret. Set it and the enforced project spending limit using [deployment instructions](deployment.md#sponsored-ai) before activation. Actual installed iOS/Android acceptance remains pending.

### Earlier baseline

- `mise run check`: TypeScript, **28 unit/integration tests**, production build passed.
- `mise run e2e`: **13 production-build browser journeys passed**. Includes CRUD/history/trash, context fallback, drafts/reload, offline shell, import cancellation/replacement/safety recovery, malformed/newer rejection, ambiguity, stale proposals and drafts, microphone denial, large-list scroll restoration, and a real waiting service-worker update blocked while editing.
- Synthetic Chromium MediaRecorder journey passed: real browser audio chunks stored before any upload; mocked transcription succeeded; mocked parsing rate-limit retained transcript; retry did not retranscribe; Apply removed audio. This uses fake microphone input and mocked OpenAI, **not an iPhone or real transcription**.
- Transaction tests cover semantic no-ops/provenance/stable IDs, calendar precision/unknown names, changed/deleted contexts including trash, duplicate/stale Apply, late attempts, allowlisted exports, failed import rollback, recoverable safety copy, new-install guard, upload/edit races, obsolete upload completion/failure after restore, and uncertain-save reconciliation.
- OpenAI boundary tests cover strict output request, `store:false`, candidate IDs, refusal/incomplete responses and HTTP failures without automatic paid retry. No live API key was configured or paid request made.
- Workers Static Assets deployed successfully on 27 September 2026 (before the rename): https://namecue.aged-bread-195a.workers.dev, source `a17b378`, Cloudflare version `1b0e9d01-31af-441b-8cd5-a846647ab493`. Live Chromium smoke check passed: HTTP 200, usable empty state, no page errors, enforced CSP, revalidated HTML/service worker, immutable hashed assets, and cached offline reload. This is not installed-iPhone validation.
- Dependency installation/audit after patching Vitest reported **0 vulnerabilities**.
- Private migration: **30 pending proposals**, **0 applied households**, validated against the portable format. Original note and review file stay outside the repository in a restricted private directory. Roles remain unspecified; spelling/uncertainty and ambiguous date wording remain reviewable.

## Measured performance, with limits

The initial full-DOM 5,000-household implementation took roughly 2.6 s to reload and 3.7 s for the automated fill-to-result observation. This justified small variable-height list windowing; whole household rows are not clipped. The normal search uses a normalized in-memory index. Back/reload preserves a visible-household anchor as well as query/filter/scroll.

Latest Linux Chromium sample after these changes:

| Synthetic households | Browser reload to populated names | Direct input event to two animation frames (no-match query) | Playwright fill to matching result observation |
| -------------------- | --------------------------------: | ----------------------------------------------------------: | ---------------------------------------------: |
| 500                  |                            201 ms |                                                       25 ms |                                         203 ms |
| 5,000                |                            473 ms |                                                       32 ms |                                         474 ms |

These are engineering observations, not installed cold-launch timings, and different measurements cover different work. Playwright observation includes driver/action overhead; it is not interchangeable with direct event-to-paint. Matching and no-match queries need repeated actual-device measurement. **The iPhone 1 s / 100 ms provisional budgets are unverified.**

## Concrete remaining release gates

| Gate                   | Observed blocker / required evidence                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source repository      | Local Git repository initialized; private GitHub repository: [daniel-sc/AhThatsWho](https://github.com/daniel-sc/AhThatsWho). Rebuild from the recorded release commit before deployment.                                                                                                                                                  |
| Permanent HTTPS origin | Resolved: deployed at https://ahthatswho.aged-bread-195a.workers.dev using authenticated Wrangler. Use the stable origin for iPhone installation and origin-specific local storage.                                                                                                                                                        |
| Real OpenAI            | No sponsorship key available locally. Configure the Worker secret and enforced OpenAI limit (or choose a personal key in Settings), check model access, run the 3-case paid synthetic evaluation, then transcribe an actual iPhone recording. Selecting candidate `gpt-6-luna` with `low` reasoning is not a completed quality evaluation. |
| Google Drive           | Live OAuth and an authorized test account are unavailable. Verify real binary asset upload/read, snapshot completion, independent history recovery and installed-PWA return. Apply migration 0003 before deployment; local server/transport tests do not establish live-provider behavior.                                                 |
| iPhone                 | Physical device/iOS version, installed launch, permissions, lifecycle, Files, authentication-return behavior, production CSP and update checks all require user participation.                                                                                                                                                             |
| Private migration      | Proposals are prepared but require user review/application and a successful real cloud backup plus clean-install recovery.                                                                                                                                                                                                                 |

## Actual iPhone acceptance checklist — all pending

Record phone model, iOS version, origin, build SHA/time, household count, network state, repeated measurements and exact failures. Use synthetic data first.

- [ ] Install from final origin; 500 and 5,000 households; airplane-mode cold launch after process termination and warm resume. Measure icon tap to usable names over at least five runs; measure representative exact/fuzzy/no-match queries.
- [ ] Lookup/manual editing/trash/history work offline; empty contexts do not trigger fallback; global fallback label is visible only on nonempty unmatched-context searches.
- [ ] Repeated microphone permission, deny/allow, lock/unlock, app switching, backgrounding and force-kill. Record selected MIME, playable final/partial behavior, duration and any unsaved tail. Verify microphone indicator clears.
- [ ] Real German/multilingual transcription and synthetic parser evaluation. Correct transcription as text and retry parsing without another transcription. Missing key/offline/401/rate-limit states preserve sources.
- [ ] Google Drive first connection, disconnect, expired session/reconnection and installed-PWA OAuth return. Confirm account and independent-history ownership, credentials and production CSP.
- [ ] Real edit → upload → fetched Asset digest validation. Immediately background after another edit; pending must remain honest and finish on resume.
- [ ] Interrupt a cloud upload; retry reconciles its UUID. Create more than ten verified snapshots and confirm latest-ten plus daily-30-day retention; automatic pruning preserves image assets. An upload overlapping a restore cannot mark restored changes backed up.
- [ ] iOS Files export/download/import; preview/cancel; malformed/newer file rejection; interrupted replacement and previous-local-data recovery.
- [ ] Restore into a clean installation/profile and compare household IDs/content, contexts, trash, history provenance, inbox and receipts. Missing audio/key must be explicit. Do not wipe the only original copy to begin this check.
- [ ] Duplicate Apply taps, stale proposals and quota/write failure. No Saved/Applied message before the durable transaction commits.
- [ ] Prompted update while editor draft, recording and import exist. No forced reload; after safe acceptance, records and navigation remain usable.
- [ ] VoiceOver/keyboard navigation, focus, contrast and touch targets. Verify large-list browsing and scroll restoration on the device.
- [ ] Review every private migration proposal, apply, export a safety snapshot, verify cloud backup and clean-install recovery before calling migration complete.

## Pragmatic defaults / limitations

English UI; multilingual data. One device. Public sponsored AI uses a small Cloudflare Worker; BYOK is direct to OpenAI. No auth service, sync, analytics, app-level encryption, permanent audio archive or generalized migration/bulk-edit framework. Private note staging is line-by-line only.

Five-second active-app backup debounce with bounded retry backoff to five minutes; one upload per coordinator. New-install authorization is explicit. Retention errors do not invalidate a verified new backup; retry on later backup/action. Audio timeslice is one second, chosen MIME by browser capability, provider upload limit 25 MB, portable JSON limit 50 MB. Raw recordings are not portable. Force-kill before the browser emits audio cannot be recovered by this app.

Current portable format is 3; legacy formats 1 and 2 remain importable. IndexedDB schema stays at version 2 because images live in OPFS. Unsupported/newer input is rejected without mutation.

No full-beta sign-off until the critical live-provider, iPhone and private-recovery gates pass.

## Google Drive backup branch — 30 September 2026

Branch `feat/google-drive-backups` adds independent installation histories with backend OAuth and Google Drive app-data snapshots. See [the agreed design](backup-design-decisions.md) and [provisioning/setup](google-drive-setup.md).

- TypeScript checks and production frontend build pass.
- 81 unit/integration tests pass, including real SQLite-backed session/flow tests, OAuth browser binding and one-time completion, account/origin isolation, 90-day expiry, idempotent/uncertain uploads, checksum failures, per-history retention, and obsolete-destination guards.
- 32 Chromium browser journeys pass, including connection return, restore preview/cancel, copying an old history into a new installation, explicit account switching, failed upload/retry, disconnect, and cross-browser completion codes. The initial three Drive journeys also passed three repetitions after fixing a startup race.
- The Worker bundle builds with D1 and the configured preview-origin allowlist. Preview uses a separate Worker/database and does not inherit production OAuth or sponsored-AI credentials.
- Real Google OAuth and installed-iPhone verification remain blocked/pending. The available GCP service account cannot create the requested project without an authorized parent; the deployment does not claim a live Google connection.
