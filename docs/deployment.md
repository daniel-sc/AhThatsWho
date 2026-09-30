# Deploy and connect

## Stable origin and source

A custom domain is optional; the default Cloudflare `workers.dev` HTTPS address is sufficient. Keep the chosen address stable before private import: IndexedDB, PWA installation and remembered keys are origin-specific, and CloudKit must allow that origin. Moving origins requires export/restore. The workspace is a local Git repository. In the managed coding environment, Git commands require execution outside the sandbox: the sandbox exposes a read-only `.git` placeholder that hides the actual repository. Build from a recorded commit with `BUILD_SHA=$(git rev-parse --short HEAD) mise exec -- npm run build`. The source repository is [daniel-sc/AhThatsWho](https://github.com/daniel-sc/AhThatsWho), created as private. Never commit the combined brief or private migration files.

`wrangler.jsonc` serves `dist` as Workers Static Assets with SPA fallback and routes `/api/*` to `src/worker.ts` before asset handling. The Worker provides public sponsored AI and optional Google Drive backup endpoints. See [Google Drive setup](google-drive-setup.md) for connection credentials, isolated preview storage and production promotion. The Worker is `ahthatswho`, serving https://ahthatswho.aged-bread-195a.workers.dev. No custom domain is required.

```sh
mise exec -- wrangler login
mise exec -- wrangler whoami
mise run check
mise run e2e
BUILD_SHA=$(git rev-parse --short HEAD) mise exec -- npm run build
mise exec -- wrangler deploy
```

A token can alternatively be supplied as `CLOUDFLARE_API_TOKEN` through the environment's secret mechanism. Do not put it in a `VITE_` variable, repository, chat or build assets. In restricted workspaces `WRANGLER_LOG_PATH=/tmp/ahthatswho-wrangler` keeps CLI logs writable. Wrangler OAuth access was verified on 27 September 2026 and deployment succeeded. Historical deployment before the rename: build `a17b378`; Cloudflare version `1b0e9d01-31af-441b-8cd5-a846647ab493`.

## Sponsored AI

1. Create a dedicated OpenAI project and configure a **$10 monthly spend limit with Enforce a hard limit enabled**. An alert alone does not stop traffic. Enforcement can slightly overshoot; there is intentionally no app spending ledger, login, bot challenge or per-user quota. See [OpenAI spend controls](https://developers.openai.com/api/docs/guides/spend-limits).
2. **Deploy the checked app/Worker together first.** Cloudflare does not allow variables/secrets on a static-assets-only Worker; the first deployment with `main: src/worker.ts` enables them. Missing secret returns a visible unavailable error; the public notebook and personal-key option still work.
3. Give that project a key with access to Responses, transcription and model retrieval. Add `OPENAI_API_KEY` as a **Secret** under the Worker's Settings → Variables and Secrets, or use `mise exec -- wrangler secret put OPENAI_API_KEY` and paste it only into the CLI prompt. Never put it in a `VITE_` variable, source, chat or built assets. Saving/deploying the secret activates sponsorship; configure the budget first. Runtime secrets persist independently of frontend builds. Preview versions may inherit the same secret: they are public sponsored endpoints too, not isolated test budgets.
4. In Settings, leave **AI payment → Sponsored**, check connection/models, then test a synthetic capture. Connection checks verify model access, not inference credit. Errors retain captures/audio and never fall back to a personal key. Switch to **Personal API key** explicitly to charge the user's account.

Local development: build once with `npm run build`, put a development project's key in ignored `.dev.vars` as `OPENAI_API_KEY=...`, then run `mise exec -- wrangler dev --port 8787`. Use that URL for the built app, or run Vite dev in another terminal; `/api` is proxied to port 8787. Never use a production key for routine tests. Static-only previews cannot provide sponsored AI without the Worker; browser tests mock inference.

The sponsored-AI endpoints accept only generation, transcription and model checks. It fixes model/prompt/schema/output limits, bounds uploads, returns no-store responses and sanitizes provider failures. These AI endpoints store/log no notes, audio or client keys. Google Drive endpoints separately retain encrypted refresh credentials and connection metadata, and transfer notebook snapshots without intentional payload persistence or logging. Public clients can still consume the shared budget; the OpenAI enforced limit is the selected control. See [decision notes](sponsored-ai.md).

## GitHub Actions

Every push and pull request runs mise-pinned installation, TypeScript checks, unit/integration tests, a production build and Chromium browser journeys. Builds include the source commit SHA. Successful runs retain `dist` as a downloadable artifact for 14 days. After checks pass, pushes to `main` or `master` deploy production. Every other branch push uploads a preview version of the isolated `ahthatswho-drive-preview` Worker with a stable branch alias, without changing production. Pull requests run checks only; their source-branch push supplies the preview. Tags do not deploy. The deployment log and preview URL appear in the Actions run summary. Manual workflow dispatch can retry deployment after configuration changes.

CI requires repository Actions secret `CLOUDFLARE_API_TOKEN` (account-scoped Workers Scripts: Edit) and variable `CLOUDFLARE_ACCOUNT_ID`. The local Wrangler OAuth session cannot authenticate GitHub runners. Set the secret directly in GitHub; never commit or paste it into chat. Deployment downloads the exact checked frontend build artifact; Wrangler bundles the checked Worker source from the same commit. Preview aliases use a hash of the full branch name; preview origins have separate local storage and should use synthetic data. CloudKit production origins are not automatically expanded for previews.

## CloudKit production

1. In Apple Developer/CloudKit Console, select the existing `iCloud.me.cbfp.namecue` container; do not register a new one. Add `https://ahthatswho.aged-bread-195a.workers.dev` to the existing website token’s allowed origins and sign-in redirects. Enable web access and issue a website API token limited to the exact intended HTTPS origin; configure its permitted sign-in redirect/origin settings.
2. In the development schema create record type **AhThatsWhoSnapshot** in the default zone. Fields: `payload` **Asset**, `exportedAt` **String** (ISO UTC; sortable index), `formatVersion` **Int64**, `byteLength` **Int64**, `digest` **String** (SHA-256 hex). Enable queryability for `recordName` and sorting for `exportedAt` as required by the Console.
3. Deploy the schema/indexes to **Production**. The adapter uses **privateCloudDatabase** only. Never replace it with public database access to work around sign-in errors.
4. AhThatsWho ships with the public website configuration for `iCloud.me.cbfp.namecue` in Production. In Settings choose **Connect iCloud**, then use Apple's sign-in control. The website token is supplied by the `VITE_CLOUDKIT_API_TOKEN` repository Actions variable at build time; it is public in the deployed JavaScript, but is not stored in source history. Local builds can set the same environment variable. The expandable configuration form remains available for developer overrides. Do not enter a server-to-server private key. Configuration and provider session tokens are device-local and excluded from backups.
5. List existing snapshots before authorizing this installation. Restore one or explicitly choose the current notebook as authoritative. An untouched installation never starts uploading emptiness.
6. Edit synthetic data and keep the app open. After debounce the coordinator snapshots one consistent transaction, saves an Asset, fetches it back and checks byte length and digest. Only then is it marked backed up. Download and import it into a second clean browser profile to verify households, history, trash, inbox and receipts.
7. Verify sign-out, expired auth, offline/resume, upload interruption, and installed-iPhone sign-in return. Generate 11 distinct completed backups and verify newest-10 retention. No success is claimed until tested against the actual container.

Saving uses a stable UUID recordName. If a save response is lost, retry first lists existing IDs and verifies the existing snapshot. Edits made during upload retain a higher pending counter. Import changes dataset generation; obsolete completion bookkeeping is ignored. Pruning occurs only after verified save, and a retention failure does not invalidate the new backup.

## CSP and cache verification

`public/_headers` restricts scripts to self and Apple's CloudKit CDN; connections to OpenAI and Apple CloudKit/auth/asset domains; frames to Apple auth; media to local blob URLs. There is no analytics. Inline styles support the small variable-height list and Apple controls; inline application scripts are not enabled. Apple account-specific asset/auth endpoints and the production CSP must be checked on the actual origin. If a required endpoint is blocked, document and add the narrow provider host; never replace the policy with a wildcard.

CloudKit SDK is loaded from `https://cdn.apple-cloudkit.com/ck/2/cloudkit.js` only when configured, after local bootstrap. Provider code executes in the same origin and can read a remembered BYOK key. Users can keep OpenAI credentials session-only.

The service worker precaches only the shell/static assets. No OpenAI, sponsored API, CloudKit, tokens or private responses are runtime-cached. `/api/*` is excluded from navigation fallback; API responses use `Cache-Control: no-store`. `sw.js` and HTML use revalidation; hashed assets can be immutable. Inspect response headers on the deployed hostname because the Vite preview server does not emulate Cloudflare `_headers`.

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

The previous origin, https://namecue.aged-bread-195a.workers.dev, is retained for existing installations to export their local data. Change the export’s top-level `format` value to `ahthatswho`, then import it at the new address and reinstall the PWA there. Browser data and installed PWAs cannot move automatically between origins.
