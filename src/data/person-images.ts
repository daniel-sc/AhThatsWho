import { assert, imageAssetId } from '../domain/integrity';
import { captureDrafts, type Backup } from '../domain/types';
import { MAX_IMAGE_BYTES, MAX_PORTRAIT_SIZE } from '../domain/person-images';

export const IMAGE_EXTENSION = 'jpg';
const PREVIEW_SIZE = 192;
const JPEG_QUALITY = 0.82;

export function imageAssetIds(backup: Backup): string[] {
  const households = [
    ...backup.households.map((r) => r.household),
    ...backup.revisions.map((r) => r.record.household),
    ...backup.inbox.flatMap((c) =>
      captureDrafts(c).flatMap((p) => (p.household ? [p.household] : [])),
    ),
  ];
  const ids = [
    ...new Set(
      households.flatMap((h) => h.people.flatMap((p) => (p.imageAssetId ? [p.imageAssetId] : []))),
    ),
  ];
  ids.forEach(imageAssetId);
  return ids.sort();
}

export async function imageDigest(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Only decoding is shared across assets. Keep large images from decoding in an
// unbounded burst when several cards enter the viewport together.
let decodeSlots = 0;
const decodeWaiters: (() => void)[] = [];
async function withDecoded<T>(
  blob: Blob,
  use: (image: HTMLImageElement) => T | Promise<T>,
): Promise<T> {
  if (decodeSlots >= 3) await new Promise<void>((resolve) => decodeWaiters.push(resolve));
  else decodeSlots++;
  let url: string | undefined;
  try {
    url = URL.createObjectURL(blob);
    const image = new Image();
    image.src = url;
    await image.decode();
    return await use(image);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Person image')) throw error;
    throw new Error('Person image could not be opened. Choose a supported JPEG or PNG image.');
  } finally {
    if (url) URL.revokeObjectURL(url);
    const next = decodeWaiters.shift();
    if (next) next();
    else decodeSlots--;
  }
}

export async function validateImageAsset(id: string, blob: Blob): Promise<void> {
  imageAssetId(id);
  assert(
    blob.size > 0 && blob.size <= MAX_IMAGE_BYTES,
    'Person image exceeds the 5 MiB limit or is empty',
  );
  const header = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  assert(
    header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff,
    'Person image must be a JPEG',
  );
  assert((await imageDigest(blob)) === id, 'Person image hash does not match its asset ID');
  await withDecoded(blob, (image) => {
    assert(
      image.naturalWidth > 0 &&
        image.naturalWidth === image.naturalHeight &&
        image.naturalWidth <= MAX_PORTRAIT_SIZE,
      'Person image must be square and at most 1024 pixels',
    );
  });
}

async function directory(previews = false): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory)
    throw new Error(
      'This browser cannot store person images. Your notebook text is still available.',
    );
  try {
    const root = await navigator.storage.getDirectory();
    const images = await root.getDirectoryHandle('person-images', { create: true });
    return await images.getDirectoryHandle(previews ? 'previews' : 'originals', { create: true });
  } catch {
    throw new Error(
      'Person image storage is unavailable. Check browser storage permissions and free space.',
    );
  }
}

async function stored(id: string, previews = false): Promise<Blob> {
  imageAssetId(id);
  const dir = await directory(previews);
  return (await dir.getFileHandle(`${id}.${IMAGE_EXTENSION}`)).getFile();
}

export async function readImageAsset(id: string): Promise<Blob> {
  let blob: Blob;
  try {
    blob = await stored(id);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Person image')) throw error;
    throw new Error('Person image is missing. Restore a backup containing this image.');
  }
  await validateImageAsset(id, blob);
  return blob;
}

async function write(dir: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const stream = await handle.createWritable();
  try {
    await stream.write(blob);
    await stream.close();
  } catch (error) {
    await stream.abort().catch(() => {});
    throw error;
  }
}

export async function ensureImageAsset(id: string, blob: Blob): Promise<void> {
  await validateImageAsset(id, blob);
  if (!navigator.locks?.request)
    throw new Error(
      'This browser cannot safely save person images. Update your browser and try again.',
    );
  await navigator.locks.request(`ahthatswho:image:${id}`, async () => {
    const dir = await directory();
    try {
      const existing = await (await dir.getFileHandle(`${id}.${IMAGE_EXTENSION}`)).getFile();
      await validateImageAsset(id, existing);
      return;
    } catch {
      // A missing or interrupted file can be repaired from these verified bytes.
    }
    try {
      await write(dir, `${id}.${IMAGE_EXTENSION}`, blob);
      const reopened = await (await dir.getFileHandle(`${id}.${IMAGE_EXTENSION}`)).getFile();
      await validateImageAsset(id, reopened);
    } catch {
      throw new Error(
        'Person image could not be saved. Check free storage space and try again. Your saved image has not changed.',
      );
    }
  });
}

function jpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('Person image could not be encoded. Choose another image.')),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  );
}

export async function encodePortrait(
  source: HTMLCanvasElement,
): Promise<{ id: string; blob: Blob }> {
  assert(source.width > 0 && source.width === source.height, 'Person image crop must be square');
  const size = Math.min(source.width, MAX_PORTRAIT_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  assert(context, 'Person image canvas is unavailable');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size, size);
  context.drawImage(source, 0, 0, size, size);
  const blob = await jpeg(canvas);
  return { id: await imageDigest(blob), blob };
}

const previewRequests = new Map<string, Promise<Blob>>();
export function imagePreview(id: string): Promise<Blob> {
  imageAssetId(id);
  const previous = previewRequests.get(id);
  if (previous) return previous;
  const request = makePreview(id).finally(() => previewRequests.delete(id));
  previewRequests.set(id, request);
  return request;
}

async function makePreview(id: string): Promise<Blob> {
  try {
    const cached = await stored(id, true);
    await withDecoded(cached, (image) => {
      assert(
        image.naturalWidth > 0 &&
          image.naturalWidth === image.naturalHeight &&
          image.naturalWidth <= PREVIEW_SIZE,
        'Person image preview is invalid',
      );
    });
    return cached;
  } catch {
    /* Previews are disposable; missing or corrupt caches regenerate. */
  }
  const original = await readImageAsset(id);
  const preview = await withDecoded(original, async (image) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(image.naturalWidth, PREVIEW_SIZE);
    const context = canvas.getContext('2d');
    assert(context, 'Person image canvas is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return jpeg(canvas);
  });
  try {
    await write(await directory(true), `${id}.${IMAGE_EXTENSION}`, preview);
  } catch {
    /* A cache write must never block access to a verified canonical image. */
  }
  return preview;
}
