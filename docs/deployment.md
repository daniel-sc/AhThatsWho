# Deploy and connect

## Stable origin and source

A custom domain is optional; the default Cloudflare `workers.dev` HTTPS address is sufficient. Keep the chosen address stable before private import: IndexedDB, PWA installation and remembered keys are origin-specific, and CloudKit must allow that origin. Moving origins requires export/restore. The workspace is a local Git repository. In the managed coding environment, Git commands require execution outside the sandbox: the sandbox exposes a read-only `.git` placeholder that hides the actual repository. Build from a recorded commit with `BUILD_SHA=$(git rev-parse --short HEAD) mise exec -- npm run build`. The source repository is [daniel-sc/name-cue](https://github.com/daniel-sc/name-cue), created as private. Never commit the combined brief or private migration files.

`wrangler.jsonc` serves `dist` as Workers Static Assets with SPA fallback. No application Worker or server proxy is required. The Worker is `namecue`, serving https://namecue.aged-bread-195a.workers.dev. No custom domain is required.

```sh
mise exec -- wrangler login
mise exec -- wrangler whoami
mise run check
mise run e2e
BUILD_SHA=$(git rev-parse --short HEAD) mise exec -- npm run build
mise exec -- wrangler deploy
```

A token can alternatively be supplied as `CLOUDFLARE_API_TOKEN` through the environment's secret mechanism. Do not put it in a `VITE_` variable, repository, chat or build assets. In restricted workspaces `WRANGLER_LOG_PATH=/tmp/namecue-wrangler` keeps CLI logs writable. Wrangler OAuth access was verified on 27 September 2026 and deployment succeeded. Live build: `a17b378`; Cloudflare version `1b0e9d01-31af-441b-8cd5-a846647ab493`.

## GitHub Actions

Every push and pull request runs mise-pinned installation, TypeScript checks, unit/integration tests, a production build and Chromium browser journeys. Builds include the source commit SHA. Successful runs retain `dist` as a downloadable artifact for 14 days. After checks pass, pushes to `main` or `master` deploy production. Every other branch push uploads a preview version with a stable branch alias, without changing production. Pull requests run checks only; their source-branch push supplies the preview. Tags do not deploy. The deployment log and preview URL appear in the Actions run summary. Manual workflow dispatch can retry deployment after configuration changes.

CI requires repository Actions secret `CLOUDFLARE_API_TOKEN` (account-scoped Workers Scripts: Edit) and variable `CLOUDFLARE_ACCOUNT_ID`. The local Wrangler OAuth session cannot authenticate GitHub runners. Set the secret directly in GitHub; never commit or paste it into chat. Deployment downloads the exact checked build artifact rather than rebuilding. Preview aliases use a hash of the full branch name; preview origins have separate local storage and should use synthetic data. CloudKit production origins are not automatically expanded for previews.

## CloudKit production

1. In Apple Developer/CloudKit Console, create/select the user's CloudKit container. Enable web access and issue a website API token limited to the exact intended HTTPS origin; configure its permitted sign-in redirect/origin settings.
2. In the development schema create record type **NameCueSnapshot** in the default zone. Fields: `payload` **Asset**, `exportedAt` **String** (ISO UTC; sortable index), `formatVersion` **Int64**, `byteLength` **Int64**, `digest` **String** (SHA-256 hex). Enable queryability for `recordName` and sorting for `exportedAt` as required by the Console.
3. Deploy the schema/indexes to **Production**. The adapter uses **privateCloudDatabase** only. Never replace it with public database access to work around sign-in errors.
4. NameCue ships with the public website configuration for `iCloud.me.cbfp.namecue` in Production. In Settings choose **Connect iCloud**, then use Apple's sign-in control. The website token is supplied by the `VITE_CLOUDKIT_API_TOKEN` repository Actions variable at build time; it is public in the deployed JavaScript, but is not stored in source history. Local builds can set the same environment variable. The expandable configuration form remains available for developer overrides. Do not enter a server-to-server private key. Configuration and provider session tokens are device-local and excluded from backups.
5. List existing snapshots before authorizing this installation. Restore one or explicitly choose the current notebook as authoritative. An untouched installation never starts uploading emptiness.
6. Edit synthetic data and keep the app open. After debounce the coordinator snapshots one consistent transaction, saves an Asset, fetches it back and checks byte length and digest. Only then is it marked backed up. Download and import it into a second clean browser profile to verify households, history, trash, inbox and receipts.
7. Verify sign-out, expired auth, offline/resume, upload interruption, and installed-iPhone sign-in return. Generate 11 distinct completed backups and verify newest-10 retention. No success is claimed until tested against the actual container.

Saving uses a stable UUID recordName. If a save response is lost, retry first lists existing IDs and verifies the existing snapshot. Edits made during upload retain a higher pending counter. Import changes dataset generation; obsolete completion bookkeeping is ignored. Pruning occurs only after verified save, and a retention failure does not invalidate the new backup.

## CSP and cache verification

`public/_headers` restricts scripts to self and Apple's CloudKit CDN; connections to OpenAI and Apple CloudKit/auth/asset domains; frames to Apple auth; media to local blob URLs. There is no analytics. Inline styles support the small variable-height list and Apple controls; inline application scripts are not enabled. Apple account-specific asset/auth endpoints and the production CSP must be checked on the actual origin. If a required endpoint is blocked, document and add the narrow provider host; never replace the policy with a wildcard.

CloudKit SDK is loaded from `https://cdn.apple-cloudkit.com/ck/2/cloudkit.js` only when configured, after local bootstrap. Provider code executes in the same origin and can read a remembered BYOK key. Users can keep OpenAI credentials session-only.

The service worker precaches only the shell/static assets. No OpenAI, CloudKit, tokens or private responses are runtime-cached. `sw.js` and HTML use revalidation; hashed assets can be immutable. Inspect response headers on the deployed hostname because the Vite preview server does not emulate Cloudflare `_headers`.

## iPhone handover and rollback

Install in Safari → Share → Add to Home Screen. Open online once, then test offline. Run every device check in `verification.md`, using synthetic fixtures first. Updates prompt; acceptance is disabled while recording, editing, capture or import is active. Do not force reload to deploy an update.

Before importing private data, export a safety snapshot and remove synthetic data using the explicit replacement path. Review the prepared migration inbox, apply each household, verify a cloud upload, then verify a clean-install recovery. Do not clear the original device as the first recovery experiment: use another browser/profile until recovery is established.

Rollback only to builds supporting the stored global format. A future migration requires a verified portable backup first. A newer local format must remain an error, never an automatic destructive downgrade.

## Official contracts consulted

- [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text): `gpt-transcribe`, multipart uploads, bounded hints, 25 MB limit and supported formats.
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): strict JSON schema, refusal/incomplete handling; local validation remains required.
- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): pinned model candidate; account access and name/ambiguity quality need real checks.
- [Apple saveRecords](https://developer.apple.com/documentation/cloudkitjs/cloudkit.database/saverecords): Blob/File Assets and downloadURL.
- [Apple performQuery](https://developer.apple.com/documentation/cloudkitjs/cloudkit.database/performquery): pagination using QueryResponse and moreComing.
- [Apple setUpAuth](https://developer.apple.com/documentation/cloudkitjs/cloudkit.container/setupauth): session check and sign-in/out controls.
