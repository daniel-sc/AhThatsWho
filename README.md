# NameCue

A personal, local-first name notebook. Solid + Vite + TypeScript, Dexie, plain CSS, vite-plugin-pwa; Cloudflare Workers Static Assets. People stay embedded in households. CloudKit is backup, not synchronization.

**Status:** working beta candidate, not a verified full beta. See [verification](docs/verification.md) for actual checks and release blockers. No live OpenAI/CloudKit or iPhone success is claimed.

## Run with mise

```sh
mise install
mise run install
mise run dev
mise run check
mise run e2e
```

Node and Wrangler are pinned in `mise.toml`; npm dependencies are locked. If this managed environment makes mise's state read-only, prefix commands with `MISE_STATE_DIR=/tmp/namecue-mise-state MISE_TRUSTED_CONFIG_PATHS=/workspace/name-cue`. Chromium/Playwright needs permission to launch processes in restricted environments. Standard machines can use `mise exec -- npx playwright install chromium` if needed.

```sh
mise exec -- npm run fixtures -- 500 /tmp/namecue-synthetic.json
mise exec -- npm run fixtures -- 5000 /tmp/namecue-stress.json
```

Import synthetic fixtures through Settings. Import previews and replaces the dataset after confirmation, retaining a local safety copy. Never mix synthetic households with private notes.

## Use

Manual editing, lookup, history, trash and inbox work without accounts or keys. Save is explicit; editor/capture drafts stay local. Search uses multiword AND, substring/typo matching and last-edit order. A nonempty query falls back globally only when the selected context has no matches.

Capture text or audio now, process/review later. Saved audio is local only, chunked while recording and removed after Apply/Discard. Processing sends capture text and candidate household data to OpenAI only on explicit action. The model never writes the database. Review Current/Proposed, including changed/removed facts. A changed target invalidates application; a receipt makes duplicate Apply harmless.

OpenAI key: Settings, optionally remember on this device. Default is memory only. Check model access explicitly, then run the three-case synthetic parser evaluation. The pinned parser candidate is `gpt-4.1-mini-2025-04-14`; transcription uses `gpt-transcribe`. Real account validation is pending. No routine test makes model calls.

Configure CloudKit only after selecting the permanent HTTPS origin. [Setup and deployment](docs/deployment.md) documents schema, sign-in, backup/recovery and CSP. The app loads Apple's SDK only after lookup can render and only if CloudKit is configured. This trusted script can access origin-local remembered credentials.

## Small module map

- `domain`: payloads, validation, normalized search, synthetic fixtures.
- `data`: six Dexie stores and transactional mutations.
- `capture`: proposals, application receipts, recorder, provider attempt guards.
- `backup`: one portable allowlist and one upload coordinator.
- `providers`: direct OpenAI fetch; CloudKit private Asset snapshots.
- `ui`, `app`: Solid screens, navigation, update prompt, backup scheduling.

No server API, app authentication, telemetry, contact/photo model, vector search, generic repository or provider plugin system.

## Data and recovery

Global format version is 1. Imports and local databases with unsupported versions are refused; no historical pre-v1 format is invented. Future format changes must add sequential deterministic transforms for current data, revisions and imports together. Saves preserve existing IDs and displaced provenance; semantic no-ops do not create history. Local operational view state is separate from portable content.

Exports contain contexts, households including trash, history, inbox text/transcripts/proposals/receipts, and the resume preference. Keys, provider tokens, audio, transient attempts/errors, drafts and search state are excluded. Imported objects are sanitized through the same allowlist. Safety snapshots survive replacement. Recovery switches to a new dataset generation so old upload completions cannot acknowledge new data.

Only one active device is supported. Immediate closure can interrupt recording or defer backup. A force-kill before the browser supplies audio cannot be made durable by the app. A clean recovery needs a verified cloud or JSON snapshot; missing raw audio and keys are stated explicitly.

## Private migration

No private source note is in this repository. The migration UI stages source lines in Inbox, retains source references, rejects repeat batches and leaves every application to review. A prepared private review file, if provided separately, must stay outside version control and public artifacts. Export current data before replacement, review every line, then verify cloud backup and clean-install recovery.
