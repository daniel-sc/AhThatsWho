import { db, backupState, setMeta, type AhThatsWhoDB } from '../data/db';
import { digest, snapshot } from './portable';
import { now, uuid } from '../domain/types';
import type { BackupProvider } from './contracts';
import { assert } from '../domain/integrity';
import { parseBackup } from '../domain/integrity';
import { imageAssetIds, readImageAsset } from '../data/person-images';
export class BackupCoordinator {
  private running = false;
  constructor(
    private provider: BackupProvider,
    private d: AhThatsWhoDB = db,
    private notify: (s: string) => void = () => {},
    private destination?: string,
  ) {}
  async authorize() {
    await this.provider.list();
    await this.d.transaction('rw', this.d.meta, async () => {
      const state = await backupState(this.d);
      assert(
        !this.destination || state.destination === this.destination,
        'Backup destination changed',
      );
      await setMeta(
        'backup',
        { ...state, authoritative: true, counter: state.counter + 1 },
        this.d,
      );
    });
  }
  private async prune(generation: string, id: string) {
    try {
      await this.provider.load(id);
      await this.provider.prune(10);
      await this.d.transaction('rw', this.d.meta, async () => {
        const state = await backupState(this.d);
        if (state.generation === generation && state.lastSnapshotId === id)
          await setMeta('backup', { ...state, retentionPending: false }, this.d);
      });
    } catch {
      this.notify('Backed up; retention retry needed');
    }
  }
  async run() {
    if (this.running) return;
    this.running = true;
    let generation: string | undefined;
    try {
      let state = await backupState(this.d);
      if (this.destination && state.destination !== this.destination) return;
      generation = state.generation;
      if (!state.authoritative) {
        this.notify('Choose restore or start fresh');
        return;
      }
      if (state.counter <= state.uploadedCounter && !state.pendingSnapshot) {
        this.notify(state.lastSuccess ? 'Backed up' : 'No backup yet');
        if (state.retentionPending && state.lastSnapshotId)
          await this.prune(state.generation, state.lastSnapshotId);
        return;
      }
      this.notify('Uploading');
      let pending = state.pendingSnapshot;
      if (!pending) {
        const captured = await this.d.transaction(
          'r',
          [this.d.households, this.d.contexts, this.d.revisions, this.d.inbox, this.d.meta],
          async () => ({ snapshot: await snapshot(this.d), state: await backupState(this.d) }),
        );
        const json = JSON.stringify(captured.snapshot);
        pending = {
          id: uuid(),
          json,
          digest: await digest(json),
          counter: captured.state.counter,
          generation: captured.state.generation,
        };
        const retained = await this.d.transaction('rw', this.d.meta, async () => {
          state = await backupState(this.d);
          if (state.generation !== pending!.generation) return false;
          await setMeta('backup', { ...state, pendingSnapshot: pending }, this.d);
          return true;
        });
        if (!retained) return;
      }
      if ((await backupState(this.d)).generation !== generation) return;
      const assets = imageAssetIds(parseBackup(pending.json));
      assert(
        !assets.length || this.provider.ensureImageAsset,
        'This backup destination cannot store person images',
      );
      for (const id of assets) {
        if ((await backupState(this.d)).generation !== generation) return;
        await this.provider.ensureImageAsset!(id, () => readImageAsset(id));
      }
      if ((await backupState(this.d)).generation !== generation) return;
      const existing = (await this.provider.list()).find((s) => s.id === pending!.id);
      if ((await backupState(this.d)).generation !== generation) return;
      if (!existing) await this.provider.save(pending.id, pending.json, pending.digest);
      const retrieved = await this.provider.load(pending.id);
      assert(
        (await digest(retrieved)) === pending.digest,
        'Uploaded backup did not pass verification',
      );
      let currentGeneration = false;
      await this.d.transaction('rw', this.d.meta, async () => {
        state = await backupState(this.d);
        if (state.generation !== pending!.generation) return;
        currentGeneration = true;
        await setMeta(
          'backup',
          {
            ...state,
            uploadedCounter: Math.max(state.uploadedCounter, pending!.counter),
            lastSuccess: now(),
            lastSnapshotId: pending.id,
            retentionPending: true,
            pendingSnapshot: undefined,
            error: undefined,
          },
          this.d,
        );
      });
      if (currentGeneration) {
        const latest = await backupState(this.d);
        this.notify(latest.counter > latest.uploadedCounter ? 'Pending' : 'Backed up');
        await this.prune(generation, pending.id);
      }
    } catch (e) {
      let belongsToCurrentDataset = false;
      await this.d.transaction('rw', this.d.meta, async () => {
        const state = await backupState(this.d);
        if (state.generation !== generation) return;
        belongsToCurrentDataset = true;
        await setMeta(
          'backup',
          { ...state, error: 'Cloud backup failed. Check connection and sign-in, then retry.' },
          this.d,
        );
      });
      if (belongsToCurrentDataset) {
        this.notify('Backup failed');
        throw e;
      }
    } finally {
      this.running = false;
    }
  }
}
