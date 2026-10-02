import { afterEach, expect, it, vi } from 'vitest';
import { AhThatsWhoDB, backupState, setMeta, saveHousehold } from '../src/data/db';
import { fixtures } from '../src/domain/fixtures';
import { uuid } from '../src/domain/types';
import { BackupCoordinator } from '../src/backup/coordinator';
import type { BackupProvider } from '../src/backup/contracts';
import { replaceData } from '../src/backup/portable';
import * as images from '../src/data/person-images';

const databases: AhThatsWhoDB[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map((d) => d.delete()));
});

async function setup() {
  const image = new Blob(['portrait']),
    id = await images.imageDigest(image);
  vi.spyOn(images, 'readImageAsset').mockResolvedValue(image);
  const b = fixtures(1);
  b.households[0].household.people[0].imageAssetId = id;
  const d = new AhThatsWhoDB(`image-backup-${uuid()}`);
  databases.push(d);
  await replaceData(b, d);
  const storage = new Map<string, string>();
  const remote = new Set<string>();
  const provider: BackupProvider = {
    async list() {
      return [];
    },
    async ensureImageAsset(asset, read) {
      await read();
      remote.add(asset);
    },
    async save(snapshot, json) {
      expect(remote.has(id)).toBe(true);
      storage.set(snapshot, json);
    },
    async load(snapshot) {
      return storage.get(snapshot)!;
    },
    async prune() {},
  };
  return { d, b, provider, storage, remote, id };
}

it('does not advance verified backup state after an interrupted image upload and retries its pending snapshot', async () => {
  const { d, provider, storage } = await setup();
  const ensure = provider.ensureImageAsset!;
  let interrupted = true;
  provider.ensureImageAsset = async (...args) => {
    await ensure(...args);
    if (interrupted) {
      interrupted = false;
      throw new Error('Lost asset response');
    }
  };
  const coordinator = new BackupCoordinator(provider, d);
  await expect(coordinator.run()).rejects.toThrow('Lost asset response');
  const failed = await backupState(d);
  expect(failed.uploadedCounter).toBe(0);
  expect(failed.lastSuccess).toBeUndefined();
  expect(storage.size).toBe(0);
  const pending = failed.pendingSnapshot!.id;
  await coordinator.run();
  expect(storage.has(pending)).toBe(true);
  expect((await backupState(d)).uploadedCounter).toBe((await backupState(d)).counter);
});

it('keeps edits during image upload pending and ignores obsolete image completions after replacement', async () => {
  const { d, b, provider, storage } = await setup();
  const ensure = provider.ensureImageAsset!;
  provider.ensureImageAsset = async (...args) => {
    await ensure(...args);
    const record = (await d.households.get(b.households[0].household.id))!;
    await saveHousehold(
      { ...record.household, cue: 'Edited while image uploads' },
      record.versionId,
      undefined,
      d,
    );
  };
  const coordinator = new BackupCoordinator(provider, d);
  await coordinator.run();
  const state = await backupState(d);
  expect(state.counter).toBeGreaterThan(state.uploadedCounter);
  expect(storage.size).toBe(1);
  provider.ensureImageAsset = async (...args) => {
    await ensure(...args);
    await replaceData(fixtures(2), d);
    throw new Error('Obsolete upload failure');
  };
  await coordinator.run();
  expect((await backupState(d)).uploadedCounter).toBe(0);
  expect((await backupState(d)).error).toBeUndefined();
  expect(storage.size).toBe(1);
});

it('lets an existing remote image satisfy an ordinary text backup without reopening local portraits', async () => {
  const { d, provider, remote, id } = await setup();
  remote.add(id);
  const localRead = vi.mocked(images.readImageAsset);
  localRead.mockClear();
  provider.ensureImageAsset = async (asset) => {
    expect(remote.has(asset)).toBe(true);
  };
  await setMeta('backup', { ...(await backupState(d)), counter: 2 }, d);
  await new BackupCoordinator(provider, d).run();
  expect(localRead).not.toHaveBeenCalled();
  expect((await backupState(d)).uploadedCounter).toBe(2);
});
