# Development

AhThatsWho uses SolidStart, Solid Router, Vite, TypeScript, Dexie, plain CSS, and vite-plugin-pwa. Cloudflare Workers serves static assets and handles the optional AI and Google Drive APIs.

For everyday use, see the [user guide](user-guide.md). Provider provisioning and release operations belong in [deployment](deployment.md) and [Google Drive setup](google-drive-setup.md). The [verification record](verification.md) distinguishes automated checks from pending live-provider and device validation.

## Local setup and checks

Install mise and run from the repository root:

```sh
mise install
mise run install
mise run dev
```

Node and Wrangler are pinned in `mise.toml`; npm dependencies are locked. SolidStart requires Node 24+ and Vite 8+. The Nitro v3 beta dependency is pinned to the version validated for this build.

```sh
mise run check
mise exec -- npx playwright install chromium
mise run e2e
```

`check` runs TypeScript checks, unit/integration tests, and the production build. The browser suite uses the built app served through Wrangler, so build before running it. Individual commands are `npm run check`, `npm test`, `npm run build`, and `npm run test:e2e`.

`npm run dev` starts SolidStart's development server. `npm run preview` serves the built `dist` files through Wrangler with production routing and headers. Local sponsored AI also requires a Worker on port 8787; Vite proxies `/api` there. See [local AI configuration](deployment.md#sponsored-ai).

In a managed environment with read-only mise state, prefix mise commands with `MISE_STATE_DIR=/tmp/ahthatswho-mise-state MISE_TRUSTED_CONFIG_PATHS="$PWD"`. Restricted environments may also need permission to launch Chromium processes.

## Synthetic data and AI evaluation

```sh
mise exec -- npm run fixtures -- 500 /tmp/ahthatswho-synthetic.json
mise exec -- npm run fixtures -- 5000 /tmp/ahthatswho-stress.json
```

Import fixtures through Settings into a separate test notebook. Import replaces the dataset after preview and confirmation, retaining a local safety copy. Keep synthetic data separate from private notes.

Routine tests mock inference and make no model calls. Inspect the synthetic parser comparison's request plan without calling OpenAI:

```sh
mise exec -- node --import tsx scripts/evaluate-capture.ts --dry-run
```

Running without `--dry-run` requires `OPENAI_API_KEY` and makes paid calls. The script compares the previous parser with current low reasoning on existing cases, and identical multiple-household prompts at low and medium reasoning. Output is JSON lines with assignment/omission checks, timing, usage, and drafts for inspection.

The parser candidate is `gpt-6-luna` with low reasoning; explicit multiple-household reprocessing uses medium. Transcription uses `gpt-transcribe`. Model selection does not establish real-account access or quality. See [capture decisions](capture-ux-decisions.md) and [sponsored AI decisions](sponsored-ai.md).

## Module map

| Module              | Responsibility                                                     |
| ------------------- | ------------------------------------------------------------------ |
| `src/domain`        | Payloads, validation, normalized search, synthetic fixtures        |
| `src/data`          | Six Dexie stores and transactional mutations                       |
| `src/capture`       | Proposals, application receipts, recorder, provider attempt guards |
| `src/backup`        | Portable allowlist and upload coordination                         |
| `src/worker.ts`     | Sponsored AI and Google Drive API endpoints                        |
| `src/providers`     | Sponsored or personal-key OpenAI requests, cloud backup adapters   |
| `src/ui`, `src/app` | Screens, navigation, update prompt, backup scheduling              |

People stay embedded in households. The notebook has no general app login or telemetry. Cloud backup uses snapshots rather than synchronization; Drive authorization is scoped to an installation.

## Data and recovery contracts

The current global format version is 2. Version 1 backups remain importable; unsupported versions are refused. Existing version 1 captures remain readable through compatibility helpers for draft and receipt fields. Future format changes must account for current data, revisions, and imports together. Saves preserve existing IDs and displaced provenance; semantic no-ops do not create history. Operational view state stays separate from portable content.

Exports include contexts, households including trash, history, inbox text/transcripts/proposals/receipts, and preferences for resume and recognition languages. Keys, provider tokens, audio, transient attempts/errors, unsaved editor drafts, and search state are excluded. Imports use the same allowlist. Version 2 retains all household review drafts and receipts.

Safety snapshots survive replacement. Recovery switches to a new dataset generation so an old upload completion cannot acknowledge new data. A receipt makes duplicate Apply harmless, and a changed target invalidates a proposal. Saved audio is chunked locally while recording and removed after Apply/Discard. Audio not yet emitted by the browser cannot survive a force-kill.

See [backup decisions](backup-design-decisions.md) and the [installation backup ADR](adr/0002-independent-installation-backups.md) for history and restore behavior.

## Navigation and static rendering

Solid Router manages bookmarkable notebook paths:

```text
/home
/settings
/capture
/inbox
/trash
/households/new
/households/:id
/households/:id/edit
/households/:id/history
/inbox/:captureId
```

Explicit paths take precedence over the resume preference. `/` remains the launch URL and resumes the last view when enabled. Household and capture links need the corresponding data on that device; missing records return to Home or Inbox with an explanation. Recording and imports block in-app history navigation.

Routes are registered in `src/app/routes.ts` and rendered through `src/app/App.tsx`. Each view in `src/app/pages/` is independently lazy-loaded. Keep view-only dependencies there or in their UI components so they stay out of the home/list load. Editor code is shared by the editor and review views.

Search/filter state belongs to each router history entry; notebook resume is persisted separately. Solid Router restores Back/Forward scroll positions. Custom restoration is limited to document resume and the virtualized list's return-to-results anchor. The household list uses variable-height windowing to keep large notebooks responsive without clipping household rows.

SolidStart owns the browser entry and build-time HTML rendering. `/privacy` is prerendered, while `/` produces a generic launch shell with a privacy link. Cloudflare also serves that shell for notebook deep links. `src/app.tsx` defines the public/privacy and notebook boundary. The notebook uses a lazy `clientOnly` import; its views use Solid's `lazy` within that boundary. Prerendering never opens IndexedDB, recordings, or local notebook contents.

`npm run build` uses Nitro's static preset. `scripts/static-build.ts` copies only `.output/public` into `dist`; no generated SolidStart server is deployed. The existing Worker owns `/api/*`. The final build step hashes generated inline hydration scripts into the CSP and regenerates the offline precache after HTML exists. The service worker precaches all chunks without executing unvisited views and serves the cached privacy document directly. Unit tests use a separate `vitest.config.ts` to avoid starting prerender/deployment plugins.

For Google OAuth branding, use the production privacy URL after the relevant build is deployed. Verify that the returned HTML contains the policy with JavaScript disabled before retrying Google's verification.

## Private migration and legacy installations

No private source note belongs in this repository. The migration UI stages source lines in Inbox, retains source references, rejects repeat batches, and leaves each application to review. Keep separately provided private review files outside version control and public artifacts. Export before replacement, review every line, and verify cloud backup and clean-install recovery.

Legacy exports can be imported after changing their top-level `format` value to `ahthatswho`. See [deployment](deployment.md) for origin changes, OPFS image storage and Drive configuration. iCloud integration is retired without deleting existing remote data.
