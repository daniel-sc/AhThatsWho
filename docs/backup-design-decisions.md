# Backup design decisions

Design confirmed by the user; implementation authorized on a branch, including OAuth setup and a branch preview. These decisions describe intended behavior, not completed implementation.

## Settled

- Local saving remains immediate and works offline. Cloud upload can remain pending after app closure and retry on return. Show pending changes and the last verified backup time; provide a Back up now action with completion feedback.
- Use Google Drive with backend-managed authorization, without a separate AhThatsWho signup. See [the authorization ADR](adr/0001-google-drive-backup-authorization.md).
- Do not add application-level backup encryption for now. This does not disable transport encryption or provider storage protections; no end-to-end confidentiality claim is made.
- Use Google Drive and retain portable file export. The person image design supersedes the earlier decision to retain iCloud: remove iCloud/CloudKit support for now without deleting existing remote backups. Additional providers and simultaneous cloud destinations are deferred.
- For Google Drive, each installation has an independent notebook and backup history, including browser and installed-PWA copies using the same Google account. Copies do not synchronize. See [the installation backup ADR](adr/0002-independent-installation-backups.md).
- Connecting offers existing histories with editable installation labels, timestamps, and notebook counts. The user chooses to restore an existing backup or back up this installation separately; a fresh empty installation does not silently start uploading.
- Restore previews whole-notebook replacement and preserves a local safety copy. Restoring another installation's snapshot copies its notebook into the current installation; subsequent backups belong to the current installation's history, leaving the source history independent.
- Retain the latest ten snapshots plus one daily snapshot for 30 days per installation, deduplicating overlaps. Never automatically prune another installation's history. Old installation histories remain until explicitly deleted.
- Under the [person image design](person-image-design-decisions.md), snapshot retention remains unchanged but separately stored cloud image assets are not pruned. Manual asset cleanup is deferred beyond the first release.
- Keep the current portable-content boundary: saved notebook content, revisions, trash, inbox text/transcripts/proposals, and existing portable preferences; exclude raw audio, unsaved editor drafts, and credentials. Clearly indicate recordings that exist only locally.
- Remember each installation's backend connection across restarts, expiring its session after 90 days without use. Expiry or loss of browser credentials requires reconnection; Google can independently invalidate authorization earlier. Disconnect stops this installation's access and preserves existing backups.
- Switching to a different Google account or cloud provider pauses uploads and explicitly offers backing up the current local notebook to that destination or previewing/restoring a backup from it. Preserve the old destination's backups and reset destination-specific upload bookkeeping. Reconnecting an expired connection to the same account normally resumes without that choice.
- Use Google's hidden app-data area with the narrow drive.appdata scope. The user delegated storage layout to implementation simplicity: this avoids managing user-visible folders and moved/renamed files. Cloud backups are browsed/restored through AhThatsWho; independent portable recovery remains available through manual file export. Removing the app's data through Google can delete these backups.
- Route uploads, backup reads, and retention through the backend; Google tokens remain server-side. Do not intentionally persist or log notebook payloads on our backend. Persist credentials and the metadata necessary for connections, installation histories, and authorization. The backend enforces installation-specific writes and automatic pruning while permitting explicit restore reads across the connected account's histories.
- If the local installation identity survives session loss, reauthorizing the same account can resume its history after server-side authorization checks. If all local data is gone, create a new installation and offer previous histories for user-selected restore. Labels, timestamps, and counts help selection; do not infer identity from a device name or assume the newest history is the correct one.
- Per-installation disconnect invalidates its backend access without invoking Google's account-wide token revocation endpoint. Existing backups remain in Drive.

## Implementation follow-through

- Choose backend persistence and secure credential/session handling within the agreed architecture; local installation IDs are identifiers, not authorization credentials. Copied login cookies must not conflate independently created local notebooks.
- Keep history identity and metadata discoverable in Drive so reconnecting does not require an old browser session. Human-readable labels are not unique identities.
- Handle missing credentials on reconnect, shared account authorization, idle session expiry, and credential cleanup without disconnecting other active installations.
- Preserve idempotent uploads and verification before success/pruning, and isolate account switches, restores, and stale in-flight work. Coordinate writes from tabs sharing one local installation.
- Validate first connection, installed-iPhone OAuth return, session loss, clean-install restore, independent histories, per-history retention, account switching, disconnect, revoked authorization, and failed/interrupted uploads. Use production OAuth publishing configuration to avoid the seven-day Testing refresh-token limit.
- iCloud/CloudKit removal is part of the person image design; its reported problems are not claimed fixed.

## Historical constraints before Drive implementation

- Backup state has no provider, account, notebook, or device identity. Switching destinations cannot safely reuse its authorization and upload counters unchanged.
- Retention currently keeps ten snapshots across the connected CloudKit account's snapshot list; separate clients have no independent retention boundaries.
- Restore replaces the whole local dataset and makes it eligible for upload. There is no cross-device merge or remote writer coordination.
