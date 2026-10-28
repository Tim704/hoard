// ───────────────────────────────────────────────────────────────────────────
//  Backup status (spec 1.1). The `backup` container writes
//  `<BACKUP_DIR>/status.json` = {lastSuccess, lastAttempt, lastError, file,
//  bytes}; the app mounts the same directory read-only at /backups. Settings
//  shows it and the `backup-watch` job warns the owner when it gets stale.
// ───────────────────────────────────────────────────────────────────────────

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** A backup older than this (hours) triggers the owner's warning. */
export const BACKUP_STALE_HOURS = 26;

export interface BackupStatus {
  /** False when the backup directory isn't mounted (e.g. local dev). */
  mounted: boolean;
  lastSuccess: string | null;
  lastAttempt: string | null;
  lastError: string | null;
  file: string | null;
  bytes: number | null;
}

const EMPTY: Omit<BackupStatus, 'mounted'> = {
  lastSuccess: null,
  lastAttempt: null,
  lastError: null,
  file: null,
  bytes: null,
};

const isoOrNull = (v: unknown) =>
  typeof v === 'string' && v && !Number.isNaN(Date.parse(v)) ? v : null;
const textOrNull = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 500) : null);

/** Parse status.json leniently: anything malformed becomes null. */
export function parseBackupStatus(raw: string, mounted = true): BackupStatus {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // fall through with empty data
  }
  const bytes = Number(data.bytes);
  return {
    mounted,
    lastSuccess: isoOrNull(data.lastSuccess),
    lastAttempt: isoOrNull(data.lastAttempt),
    lastError: textOrNull(data.lastError),
    file: textOrNull(data.file),
    bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
  };
}

/** Why the backups need attention, or null when the newest one is fresh. */
export function backupProblem(status: BackupStatus, now: Date): string | null {
  if (!status.lastSuccess) {
    return status.lastError ? `No backup has succeeded yet: ${status.lastError}` : 'No backup has been made yet.';
  }
  const ageH = (now.getTime() - Date.parse(status.lastSuccess)) / 3_600_000;
  if (ageH <= BACKUP_STALE_HOURS) return null;
  const age = ageH >= 48 ? `${Math.floor(ageH / 24)} days` : `${Math.floor(ageH)} hours`;
  return `The newest backup is ${age} old.${status.lastError ? ` Last error: ${status.lastError}` : ''}`;
}

/** Where the backups are mounted (`HOARD_BACKUP_MOUNT`, default /backups). */
export function backupDir(): string {
  return process.env.HOARD_BACKUP_MOUNT || '/backups';
}

/** Read the status file. Never throws. */
export async function readBackupStatus(dir = backupDir()): Promise<BackupStatus> {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return { mounted: false, ...EMPTY };
  } catch {
    return { mounted: false, ...EMPTY };
  }
  try {
    return parseBackupStatus(await readFile(path.join(dir, 'status.json'), 'utf8'));
  } catch {
    return { mounted: true, ...EMPTY };
  }
}
