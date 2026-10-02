import {
  BlobReader,
  ZipReader,
  ZipWriter,
  type FileEntry,
} from '@zip.js/zip.js/lib/zip-core-native.js';
import { assert, parseBackup, validateBackup } from '../domain/integrity';
import { now, type Backup } from '../domain/types';
import {
  ensureImageAsset,
  imageAssetIds,
  readImageAsset,
  validateImageAsset,
  IMAGE_EXTENSION,
} from '../data/person-images';
import { MAX_IMAGE_BYTES } from '../domain/person-images';
import { sanitize } from './portable';

export const ARCHIVE_LIMITS = {
  archiveBytes: 256 * 1024 * 1024,
  expandedBytes: 256 * 1024 * 1024,
  notebookBytes: 50 * 1024 * 1024,
  entries: 10000,
} as const;
const assetPath = (id: string) => `assets/${id}.${IMAGE_EXTENSION}`;
const ZIP_OPTIONS = { useWebWorkers: false, useCompressionStream: true };

export async function createArchive(
  input: Backup,
  reader: (id: string) => Promise<Blob> = readImageAsset,
): Promise<Blob> {
  validateBackup(input);
  const backup = sanitize(input);
  const ids = imageAssetIds(backup);
  assert(ids.length + 1 <= ARCHIVE_LIMITS.entries, 'Backup exceeds the 10,000-file limit');
  const notebook = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  assert(notebook.size <= ARCHIVE_LIMITS.notebookBytes, 'Notebook JSON exceeds the 50 MiB limit');
  let expanded = notebook.size;
  // Native streams plus the bundled JavaScript fallback avoid remote workers or
  // WASM fetches under the offline app's CSP. Images are already compressed.
  // zip.js's BlobWriter uses Response(stream).blob(), which can cancel large
  // browser exports without an error reason. Keep the download in a bounded
  // sink instead. The final Blob still occupies memory; this is not a
  // constant-memory download.
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let archiveBytes = 0;
  const sink = new WritableStream<Uint8Array>({
    write(chunk) {
      archiveBytes += chunk.byteLength;
      assert(
        archiveBytes <= ARCHIVE_LIMITS.archiveBytes,
        'Backup archive exceeds the 256 MiB limit',
      );
      chunks.push(new Uint8Array(chunk));
    },
  });
  const zip = new ZipWriter(sink, { ...ZIP_OPTIONS, level: 0 });
  try {
    await zip.add('notebook.json', new BlobReader(notebook));
    for (const id of ids) {
      const blob = await reader(id);
      await validateImageAsset(id, blob);
      expanded += blob.size;
      assert(
        expanded <= ARCHIVE_LIMITS.expandedBytes,
        'Backup expanded content exceeds the 256 MiB limit',
      );
      await zip.add(assetPath(id), new BlobReader(blob));
    }
    await zip.close();
    return new Blob(chunks, { type: 'application/zip' });
  } catch (error) {
    await zip.close().catch(() => {});
    throw error;
  }
}

// Each entry is consumed into a bounded sink. Checking the actual stream chunks
// stops forged ZIP sizes from bypassing the expanded-content budget.
async function boundedEntry(
  entry: FileEntry,
  limit: number,
  budget: { bytes: number },
): Promise<Blob> {
  assert(
    entry.uncompressedSize <= limit,
    entry.filename === 'notebook.json'
      ? 'Notebook JSON exceeds the 50 MiB limit'
      : 'Person image exceeds the 5 MiB limit',
  );
  assert(
    budget.bytes + entry.uncompressedSize <= ARCHIVE_LIMITS.expandedBytes,
    'Backup expanded content exceeds the 256 MiB limit',
  );
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  await entry.getData(
    new WritableStream<Uint8Array>({
      write(chunk) {
        bytes += chunk.byteLength;
        budget.bytes += chunk.byteLength;
        assert(
          bytes <= limit,
          entry.filename === 'notebook.json'
            ? 'Notebook JSON exceeds the 50 MiB limit'
            : 'Person image exceeds the 5 MiB limit',
        );
        assert(
          budget.bytes <= ARCHIVE_LIMITS.expandedBytes,
          'Backup expanded content exceeds the 256 MiB limit',
        );
        chunks.push(new Uint8Array(chunk));
      },
    }),
    { ...ZIP_OPTIONS, checkSignature: true },
  );
  return new Blob(chunks, {
    type: entry.filename === 'notebook.json' ? 'application/json' : 'image/jpeg',
  });
}

export async function readArchive(input: Blob): Promise<Backup> {
  assert(input.size <= ARCHIVE_LIMITS.archiveBytes, 'Backup archive exceeds the 256 MiB limit');
  const signature = new Uint8Array(await input.slice(0, 4).arrayBuffer());
  if (!(signature[0] === 0x50 && signature[1] === 0x4b)) {
    assert(input.size <= ARCHIVE_LIMITS.notebookBytes, 'Notebook JSON exceeds the 50 MiB limit');
    const backup = sanitize(parseBackup(await input.text()));
    for (const id of imageAssetIds(backup)) await readImageAsset(id);
    return backup;
  }
  const zip = new ZipReader(new BlobReader(input), { ...ZIP_OPTIONS, strictness: 'strict' });
  try {
    const entries = new Map<string, FileEntry>();
    for await (const entry of zip.getEntriesGenerator()) {
      assert(entries.size < ARCHIVE_LIMITS.entries, 'Backup exceeds the 10,000-file limit');
      assert(
        !entry.directory && !entry.symlink && !entry.encrypted,
        'Backup contains an unsupported directory, link, or encrypted file',
      );
      assert(
        entry.filename === 'notebook.json' || /^assets\/[a-f0-9]{64}\.jpg$/.test(entry.filename),
        'Backup contains an unexpected or unsafe file path',
      );
      assert(!entries.has(entry.filename), 'Backup contains duplicate file paths');
      entries.set(entry.filename, entry);
    }
    const notebook = entries.get('notebook.json');
    assert(notebook, 'Backup is missing notebook.json');
    const budget = { bytes: 0 };
    const backup = sanitize(
      parseBackup(
        await (await boundedEntry(notebook, ARCHIVE_LIMITS.notebookBytes, budget)).text(),
      ),
    );
    const ids = imageAssetIds(backup);
    assert(
      entries.size === ids.length + 1,
      'Backup contains missing or unreferenced person images',
    );
    for (const id of ids)
      assert(entries.has(assetPath(id)), 'Backup is missing a required person image');
    // Stage one verified image at a time. No notebook data is replaced here;
    // import errors may leave unused immutable files, never partial references.
    for (const id of ids) {
      const blob = await boundedEntry(entries.get(assetPath(id))!, MAX_IMAGE_BYTES, budget);
      await ensureImageAsset(id, blob);
    }
    return backup;
  } finally {
    await zip.close();
  }
}

export function downloadArchive(blob: Blob, name = `ahthatswho-${now().slice(0, 10)}.zip`): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
