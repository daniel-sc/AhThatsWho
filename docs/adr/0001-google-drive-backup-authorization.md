# Keep Google Drive authorization on the backend

For Google Drive backups, use backend-managed offline authorization so access can renew without a user interaction whenever a short-lived token expires. Connecting storage remains optional and does not require a separate AhThatsWho signup; this accepts server-side credential and session management in exchange for persistent backup access.

Google tokens remain server-side and backup operations pass through the backend, allowing it to enforce installation-specific writes and retention. Notebook payloads are handled in transit without intentional backend persistence or logging; backup files live in Google Drive.

This records the design direction, not an implemented capability. See [backup design decisions](../backup-design-decisions.md) for device association, recovery, and multiple-installation behavior.
