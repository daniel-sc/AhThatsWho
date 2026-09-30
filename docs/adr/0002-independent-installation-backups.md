# Back up installations independently

Google Drive backups support multiple installations connected to the same Google account, with a separate notebook and backup history for each installation. Browser and installed-PWA copies with separate local data are separate installations; their changes do not synchronize, avoiding writer handovers and merge/conflict behavior in this first release.

Retention must not let one installation prune another installation's history. Restoring another installation's snapshot copies the notebook into the current installation, whose subsequent backups remain in its own history; histories have editable installation labels to aid selection. See [backup design decisions](../backup-design-decisions.md) for retention and lifecycle details.
