import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js/lib/zip-core-native.js';
import { fixtures } from '../src/domain/fixtures';
import { now, uuid, type Backup } from '../src/domain/types';
import { AhThatsWhoDB, getMeta } from '../src/data/db';
import { replaceData, recoverSafety, snapshot } from '../src/backup/portable';
import { ARCHIVE_LIMITS, createArchive, readArchive } from '../src/backup/archive';
import { imageAssetIds, imageDigest } from '../src/data/person-images';

const { assets } = vi.hoisted(() => ({ assets: new Map<string, Blob>() }));
// These tests exercise ZIP boundaries and replacement safety. Actual browser
// decoding and OPFS publication are verified by the persistent-browser flow.
vi.mock('../src/data/person-images', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/data/person-images')>();
  return {
    ...actual,
    async ensureImageAsset(id: string, blob: Blob) {
      await actual.validateImageAsset(id, blob);
      assets.set(id, blob);
    },
    async readImageAsset(id: string) {
      const blob = assets.get(id);
      if (!blob) throw new Error('Person image is missing');
      await actual.validateImageAsset(id, blob);
      return blob;
    },
  };
});

const databases: AhThatsWhoDB[] = [];
beforeEach(() => {
  assets.clear();
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 1;
      naturalHeight = 1;
      src = '';
      async decode() {}
    },
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const database of databases) await database.delete();
  databases.length = 0;
});

async function archive(entries: [string, Blob][]) {
  const writer = new ZipWriter(new BlobWriter('application/zip'), {
    useWebWorkers: false,
    level: 0,
  });
  for (const [name, blob] of entries) await writer.add(name, new BlobReader(blob));
  return writer.close();
}

async function imageNotebook() {
  const backup = fixtures(1);
  const currentImage = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 0xff, 0xd9])], {
    type: 'image/jpeg',
  });
  const pastImage = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 2, 0xff, 0xd9])], {
    type: 'image/jpeg',
  });
  const currentId = await imageDigest(currentImage);
  const pastId = await imageDigest(pastImage);
  assets.set(currentId, currentImage);
  assets.set(pastId, pastImage);
  backup.households[0].household.people[0].imageAssetId = currentId;
  const historical = structuredClone(backup.households[0]);
  historical.household.people[0].imageAssetId = pastId;
  backup.revisions.push({
    id: uuid(),
    record: historical,
    archivedAt: now(),
    contextNames: { school: 'School' },
  });
  const proposed = structuredClone(backup.households[0].household);
  proposed.people[1].imageAssetId = currentId;
  backup.inbox.push({
    id: uuid(),
    createdAt: now(),
    updatedAt: now(),
    kind: 'text',
    text: 'Text',
    hints: {},
    stage: 'proposed',
    proposals: [
      {
        action: 'update',
        household: proposed,
        targetId: proposed.id,
        baseVersion: backup.households[0].versionId,
        candidateIds: [],
        contextSuggestions: [],
        reason: 'Update',
        generatedAt: now(),
        removals: [],
      },
    ],
  });
  return { backup, currentId, pastId };
}

it('round-trips current, historical and inbox images once each and retains versions 1 and 2 JSON', async () => {
  const { backup, currentId, pastId } = await imageNotebook();
  const zip = await createArchive(backup);
  assets.clear();
  const restored = await readArchive(zip);
  expect(imageAssetIds(restored)).toEqual([currentId, pastId].sort());
  expect(assets.size).toBe(2);
  expect(restored.households[0].household.people[0].imageAssetId).toBe(currentId);
  expect(restored.revisions[0].record.household.people[0].imageAssetId).toBe(pastId);
  expect(restored.inbox[0].proposals![0].household!.people[1].imageAssetId).toBe(currentId);
  for (const version of [1, 2]) {
    const legacy = { ...fixtures(1), version };
    expect((await readArchive(new Blob([JSON.stringify(legacy)]))).households).toEqual(
      legacy.households,
    );
  }
});

it('accepts a self-contained ZIP above the old 50 MiB JSON limit', async () => {
  // Chromium's native Response stream-to-Blob consumer can cancel a large
  // export with an undefined reason. ZIP downloads must not depend on it.
  vi.spyOn(Response.prototype, 'blob').mockImplementation(function (this: Response) {
    void this.body?.cancel().catch(() => {});
    return Promise.reject(undefined);
  });
  const backup = fixtures(1);
  backup.households[0].household.people = [];
  for (let index = 0; index < 11; index++) {
    const bytes = new Uint8Array(5_000_000);
    bytes.set([0xff, 0xd8, 0xff, index]);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const id = await imageDigest(blob);
    assets.set(id, blob);
    backup.households[0].household.people.push({ id: `person-${index}`, imageAssetId: id });
  }
  const zip = await createArchive(backup);
  expect(zip.size).toBeGreaterThan(50 * 1024 * 1024);
  const expected = imageAssetIds(backup);
  assets.clear();
  expect(imageAssetIds(await readArchive(zip))).toEqual(expected);
  expect(assets.size).toBe(11);
}, 20000);

it.each([
  'missing',
  'hash mismatch',
  'unsafe path',
  'duplicate path',
  'oversized image',
  'forged image size',
  'archive limit',
] as const)(
  'rejects %s before replacement and keeps the previous safety copy usable',
  async (failure) => {
    const database = new AhThatsWhoDB(`archive-${uuid()}`);
    databases.push(database);
    await replaceData(fixtures(2), database);
    await replaceData(fixtures(1), database);
    const before = await snapshot(database);
    const safety = await getMeta<Backup>('importSafety', fixtures(0), database);
    const backup = fixtures(1);
    backup.households[0].household.people[0].imageAssetId = 'a'.repeat(64);
    const entries: [string, Blob][] = [['notebook.json', new Blob([JSON.stringify(backup)])]];
    if (failure === 'hash mismatch')
      entries.push([
        `assets/${'a'.repeat(64)}.jpg`,
        new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])]),
      ]);
    if (failure === 'unsafe path') entries.push(['../assets/escape.jpg', new Blob(['unsafe'])]);
    if (failure === 'duplicate path')
      entries.push(['notebook.jsox', new Blob([JSON.stringify(backup)])]);
    if (failure === 'oversized image' || failure === 'forged image size')
      entries.push([
        `assets/${'a'.repeat(64)}.jpg`,
        new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]),
      ]);
    let zip = await archive(entries);
    if (failure === 'duplicate path' || failure === 'forged image size') {
      const bytes = new Uint8Array(await zip.arrayBuffer());
      const view = new DataView(bytes.buffer);
      if (failure === 'duplicate path') {
        const before = new TextEncoder().encode('notebook.jsox');
        const after = new TextEncoder().encode('notebook.json');
        for (let offset = 0; offset <= bytes.length - before.length; offset++)
          if (before.every((value, index) => bytes[offset + index] === value))
            bytes.set(after, offset);
      } else {
        for (let offset = 0; offset < bytes.length - 28; offset++) {
          const signature = view.getUint32(offset, true);
          const sizeOffset =
            signature === 0x02014b50 ? 24 : signature === 0x08074b50 ? 12 : undefined;
          if (
            sizeOffset !== undefined &&
            view.getUint32(offset + sizeOffset, true) > 5 * 1024 * 1024
          )
            view.setUint32(offset + sizeOffset, 1, true);
        }
      }
      zip = new Blob([bytes]);
    }
    if (failure === 'archive limit')
      vi.spyOn(zip, 'size', 'get').mockReturnValue(ARCHIVE_LIMITS.archiveBytes + 1);
    await expect(readArchive(zip).then((data) => replaceData(data, database))).rejects.toThrow();
    expect((await snapshot(database)).households).toEqual(before.households);
    expect(await getMeta('importSafety', undefined, database)).toEqual(safety);
    await recoverSafety(database);
    expect(await database.households.count()).toBe(2);
  },
);

it('blocks a JSON image reference with missing local bytes before replacing data', async () => {
  const database = new AhThatsWhoDB(`archive-${uuid()}`);
  databases.push(database);
  await replaceData(fixtures(2), database);
  const incoming = fixtures(1);
  incoming.households[0].household.people[0].imageAssetId = 'a'.repeat(64);
  await expect(replaceData(incoming, database)).rejects.toThrow('missing');
  await expect(readArchive(new Blob([JSON.stringify(incoming)]))).rejects.toThrow('missing');
  expect(await database.households.count()).toBe(2);
});
