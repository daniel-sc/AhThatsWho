export interface CloudSnapshot {
  id: string;
  exportedAt: string;
  bytes: number;
  digest: string;
  version: number;
  historyId?: string;
  snapshotId?: string;
  label?: string;
  households?: number;
  contexts?: number;
  captures?: number;
}
export interface BackupProvider {
  list(): Promise<CloudSnapshot[]>;
  save(id: string, json: string, hash: string): Promise<void>;
  load(id: string): Promise<string>;
  prune(keep: number): Promise<void>;
}
export interface DriveSession {
  connected: boolean;
  configured: boolean;
  accountId?: string;
  email?: string;
  installation?: string;
}
export interface DriveHistory {
  id: string;
  label: string;
  snapshots: CloudSnapshot[];
}
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;
