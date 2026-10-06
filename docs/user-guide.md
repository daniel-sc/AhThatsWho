# Using AhThatsWho

AhThatsWho keeps your notebook entirely on this device. No account, login, or API key is needed for manual entry, browsing, search, editing, history, trash, or the inbox. These features work locally and offline; optional AI processing and cloud backups use external services when you choose them.

## Find a familiar name

Select a context, such as school or a club, to browse the people you know from that setting. You can scroll through the household list without entering a search term. People appear together with the details that help you recognize them.

If you remember a name or a detail, search for it. Search supports partial words and typos, and matches all words in your query. Results appear in last-edit order. If a nonempty search has no matches in the selected context, it also looks across the notebook.

Contexts appear in a scrolling row on Home, with favorites first. Create contexts in Settings or the editor; a household can belong to several contexts.

## Add people

Choose **Add a person** to enter a name and a detail yourself. People are kept together in households. Changes save when you explicitly choose Save. Unfinished editor and capture drafts stay local.

The fictional example shown in a fresh notebook is display-only. It never becomes saved data or appears in backups.

## Capture and review a note

Choose **Speak or jot a note** to capture text or audio now and process it later. Saved recordings stay on this device until you request transcription; audio is removed after you apply or discard the capture.

A note can describe one or several households. AI produces suggestions for your review and never writes directly to the notebook. Compare **Current** and **Proposed**, correct the drafts, then save the complete capture together. If the existing household changes while you review, its proposal can no longer be applied; refresh the suggestions against the current entry.

- **Process now** is the main action for a written note; **Save for later** keeps it without processing. Voice notes show transcription and suggestion preparation separately. Check the suggested households before saving.
- **Reprocess as one household** or **Reprocess as multiple households** uses your corrected source text and discards earlier suggestions and draft edits when it starts. If it fails, your source remains available with **Retry**.
- **Draft as new household** uses that card's captured source excerpts when a suggested match is wrong. It keeps the original suggestion until replacement succeeds and leaves other cards unchanged. Excerpts are supplied by AI, not verified quotations. If no excerpt is available, edit manually or reprocess the whole note.
- AI can assign existing contexts. Create a new context yourself before assigning it.

Failed processing keeps the source for retry or manual editing. You can correct a transcript and retry processing without transcribing the recording again.

## AI and language settings

AI is sponsored by default, with no login or personal key. When you request processing, relevant recordings, text, and notebook details pass through our server to OpenAI.

In **Settings → AI payment**, you can choose a personal OpenAI API key instead. These requests go directly to OpenAI and charge your account. The key is session-only by default, with an option to remember it on this device. Payment modes never switch automatically.

**Settings → Recognition languages** accepts several selections, such as German and English. German is the default; clear all selections for automatic detection. Selected languages guide transcription and conversion, and generated notes follow the source language.

## Back up and recover

Export a notebook file in Settings for a copy you can keep independently. Imports preview the contents and replace the notebook after confirmation, retaining a local safety copy.

Backups include saved households, contexts, trash, history, inbox text and transcripts, review suggestions, and portable preferences. They exclude raw audio, unsaved drafts, API keys, and connection credentials.

Optional Google Drive backup keeps a separate history for each installation. A browser and an installed app can have separate notebooks even on the same device. Restoring another history copies its notebook; subsequent changes do not synchronize. iCloud integration has been retired; existing remote backups are left untouched.

Keep the app open while a backup completes and check that it is verified. Closing immediately can defer a backup or interrupt recording. Recovery requires a usable cloud snapshot or exported notebook file; it cannot restore excluded audio or keys.

Before moving to another app address, export your notebook. Browser data and installed apps do not move automatically between addresses. Verify a restore in another browser or profile before clearing your original copy.

## Install and get help

Installation help is available on the welcome screen and in Settings. On iPhone, use Safari's **Share → Add to Home Screen**, then open the installed app online once before using it offline.

Settings offers feedback by email at [hello@ahthatswho.com](mailto:hello@ahthatswho.com) and a GitHub issues link. Live-provider and physical-iPhone checks are tracked in the [verification record](verification.md).

## Person images

In the household editor, choose **Add image** beside a person. Select a photo, frame that person in the square crop, and choose **Use this image**. Save the household to keep the association. Canceling the household leaves the saved portrait unchanged. Tap a portrait in household details to enlarge it.

Replacing or removing a portrait keeps earlier associations in History; restoring that version restores its portrait. AI edits use text only and preserve images by person identity. Backup ZIP files include images referenced by saved households, trash, History and inbox proposals. Old JSON backups remain importable. Only the cropped portrait is saved, and derived previews are excluded from backups.
