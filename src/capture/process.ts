import { defaultRecognitionLanguages } from '../domain/languages';
import type { Preferences } from '../domain/types';
import { db, dirty, getMeta } from '../data/db';
import { assert } from '../domain/integrity';
import { uuid, now, captureDrafts, captureCompleted } from '../domain/types';
import { storeProposals } from './application';
import type { GenerationMode } from '../providers/openai-contract';
export async function processCapture(
  id: string,
  mode: GenerationMode = 'auto',
  draftIndex?: number,
) {
  const attempt = uuid();
  await db.transaction('rw', [db.inbox, db.meta], async () => {
    const c = await db.inbox.get(id);
    assert(c && !captureCompleted(c), 'Capture already completed');
    assert(
      draftIndex === undefined ||
        (mode === 'new' && !c.sourceChanged && captureDrafts(c)[draftIndex]),
      'Reprocess the current source first',
    );
    c.attempt = attempt;
    c.retry = { mode, draftIndex };
    delete c.error;
    if (draftIndex === undefined) {
      delete c.proposal;
      delete c.proposals;
      delete c.sourceChanged;
      c.stage = c.transcript ? 'transcript-ready' : 'source-ready';
    }
    c.updatedAt = now();
    await db.inbox.put(c);
    await dirty();
  });
  try {
    let c = (await db.inbox.get(id))!;
    const [api, rows, contexts] = await Promise.all([
      import('../providers/openai'),
      db.households.toArray(),
      db.contexts.toArray(),
    ]);
    const preferences = await getMeta<Preferences>('preferences', { resume: true });
    const languages = preferences.recognitionLanguages ?? defaultRecognitionLanguages;
    if (c.kind === 'audio' && !c.transcript && !c.audioMissing) {
      const audio = c.audioId && (await db.audio.get(c.audioId));
      assert(audio && audio.chunks.length, 'Recording is unavailable. Enter the source as text.');
      const transcript = await api.transcribe(
        new Blob(audio.chunks, { type: audio.mime }),
        audio.mime,
        rows,
        contexts,
        languages,
        c.hints,
      );
      const accepted = await db.transaction('rw', [db.inbox, db.meta], async () => {
        const current = await db.inbox.get(id);
        if (current?.attempt !== attempt) return false;
        current.transcript = transcript;
        current.stage = 'transcript-ready';
        current.updatedAt = now();
        delete current.proposal;
        await db.inbox.put(current);
        await dirty();
        return true;
      });
      if (!accepted) return;
      c = (await db.inbox.get(id))!;
    }
    if (draftIndex !== undefined) {
      const drafts = captureDrafts(c);
      const quotes = drafts[draftIndex].sourceQuotes;
      assert(
        quotes && quotes.some((quote) => quote.trim()),
        'This suggestion has no captured text. Edit it manually or reprocess the whole note.',
      );
      c = {
        ...c,
        kind: 'text',
        text: quotes.join('\n'),
        transcript: undefined,
      };
    }
    const drafts = await api.generate(c, rows, contexts, languages, mode);
    await storeProposals(id, drafts, attempt, db, draftIndex);
  } catch (error) {
    await db.transaction('rw', [db.inbox, db.meta], async () => {
      const c = await db.inbox.get(id);
      if (c?.attempt !== attempt) return;
      delete c.attempt;
      c.error = error instanceof Error ? error.message : 'Processing failed. Retry when ready.';
      await db.inbox.put(c);
      await dirty();
    });
    // Expected request failures live on the capture, where review offers Retry.
    // Only failures to start or persist processing escape to the global error UI.
  }
}
