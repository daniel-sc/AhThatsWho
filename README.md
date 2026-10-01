# AhThatsWho

A personal, local-first name notebook. Solid + Vite + TypeScript, Dexie, plain CSS, vite-plugin-pwa; Cloudflare Workers Static Assets. People stay embedded in households. Cloud backup uses snapshots, not synchronization.

**Status:** working beta candidate, not a verified full beta. See [verification](docs/verification.md) for actual checks and release blockers. No live OpenAI/CloudKit or iPhone success is claimed.

## Run with mise

```sh
mise install
mise run install
mise run dev
mise run check
mise run e2e
```

Node and Wrangler are pinned in `mise.toml`; npm dependencies are locked. If this managed environment makes mise's state read-only, prefix commands with `MISE_STATE_DIR=/tmp/ahthatswho-mise-state MISE_TRUSTED_CONFIG_PATHS="$PWD"`. Chromium/Playwright needs permission to launch processes in restricted environments. Standard machines can use `mise exec -- npx playwright install chromium` if needed.

```sh
mise exec -- npm run fixtures -- 500 /tmp/ahthatswho-synthetic.json
mise exec -- npm run fixtures -- 5000 /tmp/ahthatswho-stress.json
```

Import synthetic fixtures through Settings. Import previews and replaces the dataset after confirmation, retaining a local safety copy. Never mix synthetic households with private notes.

## Use

A fresh notebook opens with a story and a clearly labeled fictional example. Choose **Add a person** for manual entry or **Speak or jot a note** for capture and optional AI processing. The example is display-only and never enters saved data or backups. Installation help is available on welcome and in Settings. Existing records, drafts, inbox items, and restored notebooks keep the normal lookup experience.

Manual editing, lookup, history, trash and inbox work without accounts or keys. Save is explicit; editor/capture drafts stay local. Search uses multiword AND, substring/typo matching and last-edit order. A nonempty query falls back globally only when the selected context has no matches.

Capture text or audio now, process/review later. Saved audio is local only, chunked while recording and removed after Apply/Discard. Processing sends capture text and candidate household data to OpenAI only on explicit action (through our server for sponsored usage). The model never writes the database. Review Current/Proposed, including changed/removed facts. A changed target invalidates application; a receipt makes duplicate Apply harmless.

Capture one household per note; multiple members of that household can be included. If a suggested match is wrong, **Draft as new household** generates a fresh proposal from the source without existing household data. Review before applying; a failed request keeps the previous proposal. Create new contexts explicitly in Settings or the editor; AI may only assign existing contexts. Home shows all contexts in a horizontal scrolling row, favorites first. Settings offers email feedback at **hello@ahthatswho.com** and a secondary GitHub issues link.

AI is sponsored by default, with no login or personal key. Settings → AI payment offers a personal OpenAI key instead (session-only by default, optionally remembered on this device). Modes never switch automatically. Failed requests leave the source saved for retry or manual editing. Check model access explicitly, then run the three-case synthetic parser evaluation. Configure the sponsorship secret and enforced OpenAI spending limit as described in [deployment](docs/deployment.md); see [decision notes](docs/sponsored-ai.md). The parser candidate is `gpt-6-luna` with explicit `low` reasoning; transcription uses `gpt-transcribe`. Real account validation is pending. No routine test makes model calls.

Settings → Recognition languages accepts multiple selections (for example, German and English). German is the default; clear all selections for automatic detection. Selected languages guide both transcription and LLM conversion. Generated notes follow the source language. Transcription prioritizes names from the selected household and context, using deduplicated, bounded keyword hints.

Optional Google Drive backups use backend-managed authorization with no separate app signup. See [Google Drive setup](docs/google-drive-setup.md) for OAuth, isolated preview configuration, retention and recovery. Each installation keeps its own history; notebook snapshots pass through the Worker to hidden Drive app storage without intentional backend persistence or logging. Refresh credentials are encrypted server-side.

Configure CloudKit only after selecting the permanent HTTPS origin. [Setup and deployment](docs/deployment.md) documents schema, sign-in, backup/recovery and CSP. The app loads Apple's SDK only after lookup can render and only if CloudKit is configured. This trusted script can access origin-local remembered credentials.

## Small module map

- `domain`: payloads, validation, normalized search, synthetic fixtures.
- `data`: six Dexie stores and transactional mutations.
- `capture`: proposals, application receipts, recorder, provider attempt guards.
- `backup`: one portable allowlist and one upload coordinator.
- `worker`: public sponsored transcription/proposal endpoints; key stays server-side.
- `providers`: sponsored API or direct BYOK OpenAI fetch; CloudKit private Asset snapshots.
- `ui`, `app`: Solid screens, navigation, update prompt, backup scheduling.

No general app login, telemetry, contact/photo model, vector search, or generic repository/plugin system. Optional Google Drive connections use installation-scoped backend authorization. Sponsored requests pass through our Worker to OpenAI; notebook storage remains local.

## Data and recovery

Global format version is 1. Imports and local databases with unsupported versions are refused; no historical pre-v1 format is invented. Future format changes must add sequential deterministic transforms for current data, revisions and imports together. Saves preserve existing IDs and displaced provenance; semantic no-ops do not create history. Local operational view state is separate from portable content.

Exports contain contexts, households including trash, history, inbox text/transcripts/proposals/receipts, and preferences for resume and recognition languages. Keys, provider tokens, audio, transient attempts/errors, drafts and search state are excluded. Imported objects are sanitized through the same allowlist. Safety snapshots survive replacement. Recovery switches to a new dataset generation so old upload completions cannot acknowledge new data.

Google Drive supports independent backup histories for multiple installations, including browser and installed-PWA copies. Their notebooks do not synchronize; restoring another history explicitly copies its notebook. The existing CloudKit integration still supports only one active device. Immediate closure can interrupt recording or defer backup. A force-kill before the browser supplies audio cannot be made durable by the app. A clean recovery needs a verified cloud or JSON snapshot; missing raw audio and keys are stated explicitly.

## Private migration

No private source note is in this repository. The migration UI stages source lines in Inbox, retains source references, rejects repeat batches and leaves every application to review. A prepared private review file, if provided separately, must stay outside version control and public artifacts. Export current data before replacement, review every line, then verify cloud backup and clean-install recovery.

The app is **AhThatsWho**. The registered Apple container remains `iCloud.me.cbfp.namecue`; no new container is needed. The cloud record type is `AhThatsWhoSnapshot`. Before switching origins, export any personal data. Older exports can be imported after changing their top-level `format` value to `ahthatswho`. Add the new origin to the existing CloudKit website token.

## License

AhThatsWho is open source under the [MIT license](LICENSE). Bundled fonts retain their [SIL Open Font Licenses](src/assets/fonts/); third-party dependencies retain their respective licenses.

## View URLs

Solid Router manages navigation and browser history. Views have bookmarkable paths: `/home`, `/settings`, `/capture`, `/inbox`, `/trash`,
`/households/new`, `/households/:id`, `/households/:id/edit`,
`/households/:id/history`, and `/inbox/:captureId` for review. Explicit paths take
precedence over the resume preference; `/` remains the launch URL and resumes the
last view when enabled. Browser Back/Forward restores view state, including search
and scroll position. Recording and imports block in-app history navigation.
Household and capture links require the corresponding notebook data on that device;
missing records return to Home or Inbox with an explanation. Views remain client-rendered.

Route components are registered in `src/app/routes.ts` and rendered through the
shared layout in `src/app/App.tsx`. Search/filter state belongs to each router
history entry; notebook resume is persisted separately. Solid Router restores
Back/Forward scroll positions. Custom restoration is limited to document resume
and the virtualized list's explicit return-to-results anchor.

## Static rendering with SolidStart

SolidStart v2 owns the browser entry and build-time HTML rendering. `/privacy` is
prerendered; `/` produces only a generic launch shell (including a privacy link),
which Cloudflare also serves for notebook deep links. Notebook layouts and pages
use lazy `clientOnly` imports: IndexedDB, recording, and local notebook contents
are never opened by the prerenderer. `src/app.tsx` defines the public/privacy and
notebook layout boundary; the existing notebook URLs remain unchanged.

`npm run build` uses Nitro's static preset, then `scripts/static-build.ts` copies
only `.output/public` into the existing `dist` deployment directory. No generated
SolidStart server is deployed. The existing `src/worker.ts` still handles `/api/*`.
The final build step hashes Solid's inline hydration scripts into the CSP and
regenerates the offline precache after the HTML files exist. The service worker
serves the cached privacy document directly instead of falling back to the app shell.

`npm run dev` uses SolidStart's development server; `npm run preview` serves the
built static files through Wrangler, matching production headers and routing.
The test runner has a separate `vitest.config.ts` so unit tests don't start the
prerender/deployment plugins. SolidStart v2 requires Vite 8+ and Node 24+; the Nitro
v3 beta dependency is pinned to the version validated for this build.

For Google OAuth branding, use `https://ahthatswho.com/privacy/` only after this
branch has been deployed to production. Verify the returned HTML contains the
policy with JavaScript disabled before retrying Google's verification. The policy
also documents optional Drive backup planned in the separate backup branch; this
migration does not enable that integration.
