# Beta verification record

Recorded 27 September 2026. Build `0.1.0-beta.1`; format 1. The recorded test build was made before Git initialization and is marked **uncommitted-at-build-time**. The implementation is now tracked in a local Git repository; use `git log` for the current commit. Git access in the managed coding environment requires execution outside its sandbox. See `build-record.json` for the verified asset fingerprint. Environment: remote Linux x86_64, mise Node 24.21.0, Chromium through Playwright 1.63.0, 390 px iPhone-13 _viewport emulation_. **No actual iPhone was available.**

**Release status: beta candidate; full personal beta blocked on operational configuration and real-device validation.** Software integration paths exist, but mocked responses and browser emulation do not establish real-provider/device success.

## Completed evidence

### Sponsored AI addition — 29 September 2026

- `npm run check`, `npm test` (**60 tests**), and `npm run build` passed. Worker tests mock OpenAI and cover fixed request options, bounded bodies, transcription forwarding, missing credentials and sanitized upstream failures.
- Production-build browser suite: 25/27 passed initially; two test setup/selector failures were corrected, then both affected files (5 journeys) passed. All 27 journeys are covered by the successful runs. Sponsored voice/transcript retry and explicit BYOK switching are included; no live inference occurred.
- Wrangler deployment dry run passed (Worker bundle plus static assets). Local workerd smoke passed for static assets, API routing including navigation requests, no-store headers, unknown routes and missing-secret 503 responses.
- No OpenAI key exists in the local environment or `.dev.vars`. No live deployment or OpenAI platform budget change was made. Set the runtime secret and enforced project spending limit using [deployment instructions](deployment.md#sponsored-ai) before activation. Actual installed iOS/Android acceptance remains pending.

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
| Permanent HTTPS origin | Resolved: deployed at https://ahthatswho.aged-bread-195a.workers.dev using authenticated Wrangler. Use this origin for CloudKit configuration and iPhone installation.                                                                                                                                                                     |
| Real OpenAI            | No sponsorship key available locally. Configure the Worker secret and enforced OpenAI limit (or choose a personal key in Settings), check model access, run the 3-case paid synthetic evaluation, then transcribe an actual iPhone recording. Selecting candidate `gpt-6-luna` with `low` reasoning is not a completed quality evaluation. |
| CloudKit               | No container/website token/production schema/origin configuration available. Complete setup, real sign-in, Asset save/list/load/digest verification, retention and clean-install restore. Provider code follows Apple's documented API but is not validated against the user's account.                                                    |
| iPhone                 | Physical device/iOS version, installed launch, permissions, lifecycle, Files, authentication-return behavior, production CSP and update checks all require user participation.                                                                                                                                                             |
| Private migration      | Proposals are prepared but require user review/application and a successful real cloud backup plus clean-install recovery.                                                                                                                                                                                                                 |

## Actual iPhone acceptance checklist — all pending

Record phone model, iOS version, origin, build SHA/time, household count, network state, repeated measurements and exact failures. Use synthetic data first.

- [ ] Install from final origin; 500 and 5,000 households; airplane-mode cold launch after process termination and warm resume. Measure icon tap to usable names over at least five runs; measure representative exact/fuzzy/no-match queries.
- [ ] Lookup/manual editing/trash/history work offline; empty contexts do not trigger fallback; global fallback label is visible only on nonempty unmatched-context searches.
- [ ] Repeated microphone permission, deny/allow, lock/unlock, app switching, backgrounding and force-kill. Record selected MIME, playable final/partial behavior, duration and any unsaved tail. Verify microphone indicator clears.
- [ ] Real German/multilingual transcription and synthetic parser evaluation. Correct transcription as text and retry parsing without another transcription. Missing key/offline/401/rate-limit states preserve sources.
- [ ] CloudKit first login, sign-out, expired session/reauthentication and installed-PWA return. Confirm production schema, origins and CSP permit only needed provider hosts.
- [ ] Real edit → upload → fetched Asset digest validation. Immediately background after another edit; pending must remain honest and finish on resume.
- [ ] Interrupt a cloud upload; retry reconciles its UUID. Create 11 verified snapshots and confirm newest-10 retention. An upload overlapping a restore cannot mark restored changes backed up.
- [ ] iOS Files export/download/import; preview/cancel; malformed/newer file rejection; interrupted replacement and previous-local-data recovery.
- [ ] Restore into a clean installation/profile and compare household IDs/content, contexts, trash, history provenance, inbox and receipts. Missing audio/key must be explicit. Do not wipe the only original copy to begin this check.
- [ ] Duplicate Apply taps, stale proposals and quota/write failure. No Saved/Applied message before the durable transaction commits.
- [ ] Prompted update while editor draft, recording and import exist. No forced reload; after safe acceptance, records and navigation remain usable.
- [ ] VoiceOver/keyboard navigation, focus, contrast and touch targets. Verify large-list browsing and scroll restoration on the device.
- [ ] Review every private migration proposal, apply, export a safety snapshot, verify cloud backup and clean-install recovery before calling migration complete.

## Pragmatic defaults / limitations

English UI; multilingual data. One device. Public sponsored AI uses a small Cloudflare Worker; BYOK is direct to OpenAI. No auth service, sync, analytics, app-level encryption, permanent audio archive or generalized migration/bulk-edit framework. Private note staging is line-by-line only.

Five-second active-app backup debounce with bounded retry backoff to five minutes; one upload per coordinator. New-install authorization is explicit. Retention errors do not invalidate a verified new backup; retry on later backup/action. Audio timeslice is one second, chosen MIME by browser capability, provider upload limit 25 MB, portable JSON limit 50 MB. Raw recordings are not portable. Force-kill before the browser emits audio cannot be recovered by this app.

Only format 1 exists; there is no historical format to migrate yet. Unsupported older/newer input is rejected without mutation. Future versions must introduce shared deterministic sequential migrations before changing the global version.

No full-beta sign-off until the critical live-provider, iPhone and private-recovery gates pass.
