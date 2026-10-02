import { Title } from '@solidjs/meta';
export function PrivacyPage() {
  return (
    <main class="privacy-page">
      <Title>Privacy · AhThatsWho</Title>
      <h1>AhThatsWho privacy</h1>
      <p>Last updated: 2 October 2026</p>
      <p>
        AhThatsWho is a personal name notebook. You can use its manual features without an account.
        Your notebook is saved in this browser or installed app. There is no analytics tracking.
      </p>
      <h2>Person images</h2>
      <p>
        Selected photos are cropped and compressed on your device. Only the cropped portrait is
        saved; the original photo is not retained. Person images are never sent to AI. Replacing or
        removing a portrait keeps earlier images in History. Unused image files are retained for
        now, and backups include the images referenced by saved content and History.
      </p>
      <h2>Optional Google Drive backup</h2>
      <p>
        Google Drive backup is being introduced and is available only in builds where it is enabled.
        The following explains how it works when you choose to connect it.
      </p>
      <p>
        If you connect Google Drive, we request access only to AhThatsWho's hidden app-data storage,
        together with your Google account identifier and email address to identify and display the
        backup destination. We do not request general access to your Drive files.
      </p>
      <p>
        Notebook snapshots and cropped person images pass through our server to Google Drive. We do
        not intentionally save or log their contents on our server. We store encrypted Google
        authorization credentials and connection metadata to keep the connection working, and retain
        backup identifiers and checksums to handle retries. Local connection credentials identify
        this installation. Backups are not end-to-end encrypted by AhThatsWho.
      </p>
      <p>
        Each installation has its own history. Backups include saved people and their images,
        contexts, revisions, trash, inbox text, transcripts, proposals, and portable preferences.
        Raw audio, unsaved drafts, API keys, and connection credentials are excluded. Automatic
        uploads run while the app is open.
      </p>
      <p>
        Each history retains the latest ten snapshots and one daily snapshot for 30 days. Histories
        from older installations remain until explicitly deleted. Image assets are retained in each
        history even after older snapshots expire. You can browse, download, and restore backups in
        Settings, or permanently delete another installation's history there. You can also delete
        AhThatsWho's hidden app data through Google Drive. Export a backup file if you want a copy
        independent of the app.
      </p>
      <p>
        Disconnecting an installation stops its access and leaves cloud backups intact. Its server
        session is removed; server-side refresh credentials are removed when no remaining session or
        pending connection needs them. Sessions expire after 90 days without use; expired sessions
        and unneeded credentials are cleaned up during subsequent connection or disconnection
        operations. You can remove AhThatsWho's permission in your Google account, which affects all
        installations connected to that Google account.
      </p>
      <h2>Optional AI processing</h2>
      <p>
        When you explicitly request transcription or suggested edits, the relevant recording, text,
        and notebook details are sent to OpenAI. Sponsored requests pass through our server without
        intentional storage or logging of their contents. With your personal API key, requests go
        directly to OpenAI. Your personal API key stays on this device and is excluded from backups.
      </p>
      <h2>Service providers and use of Google data</h2>
      <p>
        Cloudflare hosts our app and backend. Google stores optional Drive backups, and OpenAI
        processes AI requests you initiate. We use Google account information and Drive access only
        to provide the backup features described here. We do not sell Google user data or use it for
        advertising. Connecting Drive does not send your backups to OpenAI; AI processing requires a
        separate action in the app.
      </p>
      <h2>Your choices and contact</h2>
      <p>
        You can export your notebook, stop cloud backup, revoke provider access, or remove local app
        data. Removing local data does not delete existing cloud backups. For questions or help
        removing server-side connection information, email
        <a href="mailto:hello@ahthatswho.com">hello@ahthatswho.com</a>.
      </p>
      <p>
        <a href="/">Return to AhThatsWho</a>
      </p>
    </main>
  );
}
