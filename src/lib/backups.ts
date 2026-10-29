// ───────────────────────────────────────────────────────────────────────────
//  Backup status (spec 1.1). The app mounts the backup folder read-only at
//  /backups and understands two layouts:
//    - the opt-in `backup` compose service writes `status.json` =
//      {lastSuccess, lastAttempt, lastError, file, bytes} (preferred);
//    - otherwise (e.g. a host cron writing `<db>-YYYYMMDD.dump`) the newest
//      `*.dump` file in the folder, daily/ or weekly/ is taken, by mtime.
//  Settings shows it and the `backup-watch` job warns the owner when stale.
// ───────────────────────────────────────────────────────────────────────────

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** A backup older than this (hours) triggers the owner's warning. */
export const BACKUP_STALE_HOURS = 26;

export interface BackupStatus {
  /** False when the backup directory isn't mounted (e.g. local dev). */
  mounted: boolean;
  /**
   * Where the status came from: Hoard's own `status.json`, the newest dump
   * file found in the folder, or nothing yet.
   */
  source: 'status' | 'folder' | null;
  lastSuccess: string | null;
  lastAttempt: string | null;
  lastError: string | null;
  file: string | null;
  bytes: number | null;
}

const EMPTY: Omit<BackupStatus, 'mounted'> = {
  source: null,
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
    source: 'status',
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

/**
 * What backup-watch should warn about, or null. Like `backupProblem`, but
 * quiet about "no backup yet" while the app has been up for less than 26 h,
 * so a fresh deploy doesn't warn before the first nightly backup ran.
 */
export function backupWarning(status: BackupStatus, now: Date, uptimeMs: number): string | null {
  if (!status.lastSuccess && uptimeMs < BACKUP_STALE_HOURS * 3_600_000) return null;
  return backupProblem(status, now);
}

/** Where the backups are mounted (`HOARD_BACKUP_MOUNT`, default /backups). */
export function backupDir(): string {
  return process.env.HOARD_BACKUP_MOUNT || '/backups';
}

export interface DumpFile {
  /** Path relative to the backup folder, e.g. `hoard-20261028.dump`. */
  file: string;
  mtimeMs: number;
  bytes: number;
}

/** The newest finished dump (`*.dump`, non-empty; temp files ignored), or null. */
export function pickNewestDump(files: DumpFile[]): DumpFile | null {
  let best: DumpFile | null = null;
  for (const f of files) {
    if (!f.file.endsWith('.dump') || !(f.bytes > 0) || !Number.isFinite(f.mtimeMs)) continue;
    if (!best || f.mtimeMs > best.mtimeMs) best = f;
  }
  return best;
}

/** Status derived from the newest dump file in the folder (no status.json). */
export function statusFromDump(dump: DumpFile | null): BackupStatus {
  if (!dump) return { mounted: true, ...EMPTY };
  const at = new Date(dump.mtimeMs).toISOString();
  return {
    mounted: true,
    source: 'folder',
    lastSuccess: at,
    lastAttempt: at,
    lastError: null,
    file: dump.file,
    bytes: dump.bytes,
  };
}

/** The dump files in `dir`, `dir/daily` and `dir/weekly` (missing ones skipped). */
async function listDumps(dir: string): Promise<DumpFile[]> {
  const out: DumpFile[] = [];
  for (const sub of ['', 'daily', 'weekly']) {
    let names: string[];
    try {
      names = await readdir(path.join(dir, sub));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.dump')) continue;
      try {
        const s = await stat(path.join(dir, sub, name));
        if (s.isFile()) out.push({ file: sub ? `${sub}/${name}` : name, mtimeMs: s.mtimeMs, bytes: s.size });
      } catch {
        // vanished between readdir and stat
      }
    }
  }
  return out;
}

/** Read status.json, or else derive the status from the newest dump. Never throws. */
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
    // no status.json: fall back to the folder's dump files
  }
  try {
    return statusFromDump(pickNewestDump(await listDumps(dir)));
  } catch {
    return { mounted: true, ...EMPTY };
  }
}
