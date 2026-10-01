# Google Drive backup setup

Google Drive backup uses an optional storage connection, not an AhThatsWho signup. The Worker retains encrypted Google refresh credentials and hashed installation sessions in D1. Notebook JSON passes through the Worker without intentional persistence or logging and is saved in Google's hidden app-data area. Google account ID and email identify the destination; the email is displayed when choosing where to back up.

## Branch preview

Branch: `feat/google-drive-backups`.

The dedicated preview Worker is `ahthatswho-drive-preview`. Its database is `ahthatswho-backups-preview` (`810f5185-7f34-4f15-97cf-776d695d7a0f`). Production Worker bindings, secrets and notebook data are not reused. Preview origins have separate namespaces in D1 and Drive, even if the same OAuth client is used. Use synthetic notebooks on previews.

The stable branch alias is:

`https://branch-1670742325881135-ahthatswho-drive-preview.aged-bread-195a.workers.dev`

The base preview address is:

`https://ahthatswho-drive-preview.aged-bread-195a.workers.dev`

Configure these exact OAuth redirect URIs:

- `https://branch-1670742325881135-ahthatswho-drive-preview.aged-bread-195a.workers.dev/api/backup/callback`
- `https://ahthatswho-drive-preview.aged-bread-195a.workers.dev/api/backup/callback`

The flow redirects through our authorization endpoint; it does not load Google's browser SDK, so JavaScript origins are not required by this implementation. Allowed backend origins are explicitly configured in `BACKUP_ORIGINS`; arbitrary version URLs cannot initiate OAuth. Auth callbacks have no analytics or external resources, and use no-store and no-referrer.

## GCP project and OAuth client

1. Use the existing **AhThatsWho** project: ID `ahthatswho`, project number `672364502714`.
2. `drive.googleapis.com` is enabled in this project (verified 1 October 2026).
3. Configure Google Auth Platform branding, audience and contact information for AhThatsWho. Use an authorized support email; add the app homepage and privacy policy when required by Google.
4. Create an OAuth client of type **Web application** with the exact redirect URIs above. Google Auth Platform's web OAuth client is distinct from IAM workforce OAuth clients and IAP OAuth clients; those are not substitutes.
5. Request only `https://www.googleapis.com/auth/drive.appdata`, `openid`, and `email`. The Drive permission is non-sensitive. Publishing/branding requirements still apply. In Testing, add explicit test users; Drive refresh tokens then expire after seven days. Switch to In production for persistent real-user connections when Google's required configuration is complete.
6. Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Worker secrets in the **preview** environment, never frontend variables. Keep the credential JSON out of source control and chat. Configure `BACKUP_ENCRYPTION_KEY` with a cryptographically random 32-byte base64url value. Rotating that key requires migrating encrypted credentials or reconnecting all affected installations.

```sh
mise exec -- wrangler d1 migrations apply ahthatswho-backups-preview --env preview --remote
mise exec -- wrangler secret put GOOGLE_CLIENT_ID --env preview
mise exec -- wrangler secret put GOOGLE_CLIENT_SECRET --env preview
mise exec -- wrangler secret put BACKUP_ENCRYPTION_KEY --env preview
```

Applying migrations requires D1 access, beyond a Workers Scripts-only deployment token. Apply reviewed schema changes explicitly before pushing builds that need them; the branch workflow uploads versions using the existing deployment credential.

## Connection and recovery behavior

- Each local IndexedDB installation generates an ID and a separate random device secret, both excluded from portable backups. Shared browser tabs coordinate uploads with a Web Lock. A PWA with separate local storage generates its own identity even if Safari copied cookies during installation.
- OAuth uses a short-lived, one-use flow, PKCE, and an HttpOnly SameSite=Lax browser cookie for callback binding. The original installation claims completion with a separate secret; the callback never puts a Google token or app session in a URL. Same-browser completion is automatic. If authorization opened in a different browser context, the return page displays a one-time connection code that the user enters in the original app. This prevents someone who starts an OAuth flow from acquiring another person's storage connection by sharing the authorization link. Interrupted claims can require connecting again.
- Backend sessions expire after 90 idle days and require the installation's device secret as well as the session token. These client credentials are kept in local IndexedDB. Google refresh tokens and the OAuth client secret never reach page JavaScript.
- Histories and readable labels are stored in Drive. Clearing all local data creates a new history; users explicitly select which previous history to restore. Losing only the session can resume the previous history after reauthorizing the same account.
- A provider/account change resets local upload bookkeeping and requires a restore-or-upload choice. A normal same-account reconnection retains that choice.
- Disconnect invalidates this installation's backend session. It does not call Google's project-wide revocation endpoint or delete Drive files. Unreferenced refresh credentials are cleaned up during connect/disconnect; expired sessions cannot authenticate even before cleanup runs.
- Latest-ten plus daily-for-30-days retention uses UTC calendar days and server snapshot receipt times. Retention runs only after verified upload. Other histories are never automatically pruned; deleting another history is a separate explicit, irreversible action.
- Raw audio, unsaved drafts and credentials remain excluded. File export remains the portable recovery path if the service is unavailable. Deleting hidden app data in Google can remove cloud backups.

## Production promotion

Create a separate production D1 database, apply migrations, configure production OAuth credentials and encryption key, add the permanent production callback to the correct OAuth client, and allow only the intended production origin. The branch deliberately does not turn on production backup or share preview credentials with it. The preview environment also does not inherit the production sponsored-AI secret.

Before promotion, verify a real Google connection, upload/download checksum, clean-profile restore, consent cancellation/revocation, and the installed-iPhone return flow. Automated tests use synthetic OAuth/Drive responses; they do not establish real Google or iPhone success.

## Official contracts

- [Google web-server OAuth and offline access](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Refresh-token expiry, including Testing mode](https://developers.google.com/identity/protocols/oauth2#expiration)
- [App-data storage](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Pre-generated file IDs for safe upload retries](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds)
- [Creating Google Workspace OAuth credentials](https://developers.google.com/workspace/guides/create-credentials)

## Provisioning result on 1 October 2026

The preview Worker, D1 database, both migrations, and preview-only `BACKUP_ENCRYPTION_KEY` were provisioned. The user created **AhThatsWho** (`ahthatswho`, number `672364502714`) and granted Editor to `opencode-workstation-sa@playground-incubator.iam.gserviceaccount.com`. Direct project access succeeded, and `gcloud services enable drive.googleapis.com --project=ahthatswho` completed successfully. Project listing initially lagged behind direct access.

The remaining provisioning step is Google Auth Platform registration and creation of a **Web application** OAuth client. Google's documented client-creation flow uses the console; this environment has service-account CLI access but no authenticated console browser. Additional IAM roles are not the missing requirement. Do not substitute an IAM workforce or IAP OAuth client.

Open [Google Auth Platform for this project](https://console.cloud.google.com/auth/overview?project=ahthatswho). Register the app as **AhThatsWho**, using the project owner's support/contact email and an **External** audience. Configure the three scopes listed above. For initial Testing, add the Google accounts that will test backups; Testing refresh tokens expire after seven days. Use **In production** when the required setup is complete to avoid that Testing-mode expiry.

Under [Clients](https://console.cloud.google.com/auth/clients?project=ahthatswho), create a **Web application** named **AhThatsWho Drive preview**, with both exact redirect URIs listed above and no JavaScript origins. Download the credential JSON when creating it: Google only exposes a new client secret at creation. Save it outside source control, for example `/tmp/ahthatswho-oauth-client.json`, or in the ignored `private/` directory. Do not paste the secret into chat. Once available locally, install its `web.client_id` and `web.client_secret` as preview Worker secrets and upload a new preview version so the branch alias receives those bindings. Preserve the existing `BACKUP_ENCRYPTION_KEY`.

The deployed status endpoint deliberately reports unconfigured until the Google client ID and secret are installed. Real Google consent, refresh, upload and recovery remain unverified; the branch includes synthetic backend and browser tests for these flows. The privacy page for Google Auth Platform setup is `/privacy.html` on the intended app origin.
