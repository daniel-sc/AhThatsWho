import { db, saveCapture } from '../data/db';
import { now, uuid, type Capture } from '../domain/types';
export async function startRecording(
  hints: Capture['hints'],
  onStop: (c: Capture) => void,
  onError: (e: Error) => void,
) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
    throw new Error('Recording is unavailable in this browser. Use text or keyboard dictation.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let recorder: MediaRecorder;
  try {
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((x) =>
      MediaRecorder.isTypeSupported(x),
    );
    if (!mime) throw new Error('No supported recording format. Use keyboard dictation.');
    recorder = new MediaRecorder(stream, { mimeType: mime });
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  const c: Capture = {
    id: uuid(),
    kind: 'audio',
    createdAt: now(),
    updatedAt: now(),
    hints: structuredClone(hints),
    stage: 'source-ready',
    audioId: uuid(),
  };
  try {
    await saveCapture(c);
    await db.audio.add({
      id: c.audioId!,
      captureId: c.id,
      chunks: [],
      mime: recorder.mimeType,
      complete: false,
    });
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  let writes = Promise.resolve();
  let failed = false;
  let stopped = false;
  let wakeLock: WakeLockSentinel | undefined;
  const releaseWakeLock = () => {
    void wakeLock?.release().catch(() => {});
    wakeLock = undefined;
  };
  const keepScreenAwake = async () => {
    try {
      const lock = await navigator.wakeLock?.request('screen');
      // The recording may have ended while the request was pending.
      if (stopped) await lock?.release();
      else wakeLock = lock;
    } catch {
      // Keeping the screen awake is only a convenience.
    }
  };
  recorder.ondataavailable = (e) => {
    if (!e.data.size) return;
    writes = writes
      .then(() =>
        db.transaction('rw', db.audio, async () => {
          const a = await db.audio.get(c.audioId!);
          if (!a) throw new Error('Recording storage is missing');
          a.chunks.push(e.data);
          await db.audio.put(a);
        }),
      )
      .catch(() => {
        failed = true;
        onError(new Error('Could not save recording data. Storage may be full.'));
        stop();
      });
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    releaseWakeLock();
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  };
  const hidden = () => {
    if (document.hidden) stop();
  };
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', stop);
  recorder.onerror = () => {
    failed = true;
    onError(new Error('Recording was interrupted. Check saved audio before processing.'));
    stop();
  };
  recorder.onstop = async () => {
    stopped = true;
    releaseWakeLock();
    stream.getTracks().forEach((t) => t.stop());
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', stop);
    await writes;
    try {
      const audio = await db.audio.get(c.audioId!);
      if (audio?.chunks.length) {
        audio.complete = !failed;
        await db.audio.put(audio);
        c.audioIncomplete = failed;
      } else {
        c.stage = 'missing-source';
        c.audioMissing = true;
      }
      await saveCapture(c);
      onStop(c);
    } catch {
      onError(new Error('Recording could not be finalized. Check Inbox for received chunks.'));
    }
  };
  try {
    if (document.hidden)
      throw new Error('Recording did not start because the app was backgrounded.');
    recorder.start(1000);
    void keepScreenAwake();
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', stop);
    c.stage = 'missing-source';
    c.audioMissing = true;
    await saveCapture(c);
    throw error;
  }
  return { stop, captureId: c.id };
}
