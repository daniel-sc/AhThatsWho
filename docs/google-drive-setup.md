# Google Drive backup setup

Google Drive backup uses an optional storage connection, not an AhThatsWho signup. The Worker retains encrypted Google refresh credentials and hashed installation sessions in D1. Notebook JSON passes through the Worker without intentional persistence or logging and is saved in Google's hidden app-data area. Google account ID and email identify the destination; the email is displayed when choosing where to back up.

## Branch previews

Use Cloudflare native branch Previews under `ahthatswho`; see [deployment](deployment.md#github-actions). Backup is intentionally disabled on these previews: they have no D1 backup binding or OAuth credentials. Do not import production backup bindings or credentials into Preview Base. Sponsored AI is available through the base AI secret.

The former `ahthatswho-drive-preview` Worker and its branch URLs are retired. Its test database `ahthatswho-backups-preview` (`810f5185-7f34-4f15-97cf-776d695d7a0f`) is retained, not migrated or deleted. Historical provisioning details below describe that retired setup. If preview backup testing becomes necessary, explicitly configure isolated storage, preview OAuth credentials and exact callback URLs first.

## Connection and recovery behavior

- Each local IndexedDB installation generates an ID and a separate random device secret, both excluded from portable backups. Shared browser tabs coordinate uploads with a Web Lock. A PWA with separate local storage generates its own identity even if Safari copied cookies during installation.
- OAuth uses a short-lived, one-use flow, PKCE, and an HttpOnly SameSite=Lax browser cookie for callback binding. The original installation claims completion with a separate secret; the callback never puts a Google token or app session in a URL. Same-browser completion is automatic. If authorization opened in a different browser context, the return page displays a one-time connection code that the user enters in the original app. This prevents someone who starts an OAuth flow from acquiring another person's storage connection by sharing the authorization link. Interrupted claims can require connecting again.
- Backend sessions expire after 90 idle days and require the installation's device secret as well as the session token. These client credentials are kept in local IndexedDB. Google refresh tokens and the OAuth client secret never reach page JavaScript.
- Histories and readable labels are stored in Drive. Clearing all local data creates a new history; users explicitly select which previous history to restore. Losing only the session can resume the previous history after reauthorizing the same account.
- A provider/account change resets local upload bookkeeping and requires a restore-or-upload choice. A normal same-account reconnection retains that choice.
- Disconnect invalidates this installation's backend session. It does not call Google's project-wide revocation endpoint or delete Drive files. Unreferenced refresh credentials are cleaned up during connect/disconnect; expired sessions cannot authenticate even before cleanup runs.
- Latest-ten plus daily-for-30-days retention uses UTC calendar days and server snapshot receipt times. Retention runs only after verified upload. Other histories are never automatically pruned; deleting another history is a separate explicit, irreversible action.
- Raw audio, unsaved drafts and credentials remain excluded. File export remains the portable recovery path if the service is unavailable. Deleting hidden app data in Google can remove cloud backups.

## Production deployment

Production infrastructure is prepared: D1 `ahthatswho-backups` (`2bdd76d7-da72-42d3-95fe-7b62d7f3e732`), both migrations, dedicated OAuth credentials, and a separate encryption key. The production OAuth client has callback `https://ahthatswho.com/api/backup/callback`, and the branch config allows only `https://ahthatswho.com`. Production secrets were activated in a secrets-only version of the existing application. The backup branch was merged into `main` on 1 October 2026 at the user’s request. The main deployment activates the feature code and production database binding. Native previews use their separately configured Preview Base AI secret.

Production acceptance testing remains: verify a real Google connection, upload/download checksum, clean-profile restore, consent cancellation/revocation, and installed-iPhone/Android return flows. The user will complete GCP verification and perform these checks in production. Automated tests use synthetic OAuth/Drive responses; they do not establish real Google or iPhone success.

## Official contracts

- [Google web-server OAuth and offline access](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Refresh-token expiry, including Testing mode](https://developers.google.com/identity/protocols/oauth2#expiration)
- [App-data storage](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Pre-generated file IDs for safe upload retries](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds)
- [Creating Google Workspace OAuth credentials](https://developers.google.com/workspace/guides/create-credentials)

## Provisioning result on 1 October 2026

The preview Worker, D1 database, both migrations, and preview-only `BACKUP_ENCRYPTION_KEY` were provisioned. The user created **AhThatsWho** (`ahthatswho`, number `672364502714`) and granted Editor to `opencode-workstation-sa@playground-incubator.iam.gserviceaccount.com`. Direct project access succeeded, and `gcloud services enable drive.googleapis.com --project=ahthatswho` completed successfully. Project listing initially lagged behind direct access.

Both user-supplied Web application credential JSON files were validated and installed through Wrangler's versioned secret API, using stdin without logging their secret values. Test client `672364502714-mhmjv6r1lc65dhp1madm30f60ogev61a.apps.googleusercontent.com` is installed in `ahthatswho-drive-preview`; production client `672364502714-phemij85vihto346jv8i9vot7k6vcq8v.apps.googleusercontent.com` is installed in `ahthatswho`. The existing preview encryption key was preserved. A new production encryption key was generated directly into the secret upload, with no key written into this repository or chat.

The supplied files configure both preview redirects and the production callback above. Console publishing/branding status and test-user membership are not included in these JSON files and remain unconfirmed. Production privacy content is available at `https://ahthatswho.com/privacy/`; the old standalone `public/privacy.html` was removed when this branch integrated SolidStart, so there is one policy source.

The backend/browser automated tests simulate Google responses. A live redirect check confirms configured clients and PKCE parameters but does not establish real consent, refresh, upload, recovery, or installed-iPhone/Android success. Real connection, backup, restore, and installed-PWA authorization returns on both platforms remain to be tested in production after the user completes GCP verification. The cross-context one-time-code fallback is implemented and covered by automated tests.
