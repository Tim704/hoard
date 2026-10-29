import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  backupProblem,
  backupWarning,
  parseBackupStatus,
  pickNewestDump,
  readBackupStatus,
  statusFromDump,
} from './backups';

const now = new Date('2026-10-28T09:00:00Z');

describe('parseBackupStatus', () => {
  it('reads the fields the backup script writes', () => {
    const s = parseBackupStatus(
      JSON.stringify({
        lastSuccess: '2026-10-28T02:00:05Z',
        lastAttempt: '2026-10-28T02:00:00Z',
        lastError: null,
        file: 'daily/hoard-2026-10-28.dump',
        bytes: 123456,
      }),
    );
    expect(s).toEqual({
      mounted: true,
      source: 'status',
      lastSuccess: '2026-10-28T02:00:05Z',
      lastAttempt: '2026-10-28T02:00:00Z',
      lastError: null,
      file: 'daily/hoard-2026-10-28.dump',
      bytes: 123456,
    });
  });

  it('turns junk into nulls', () => {
    for (const raw of ['', 'not json', '[]', '{"lastSuccess":"yesterday","bytes":"x"}']) {
      const s = parseBackupStatus(raw);
      expect(s.lastSuccess).toBeNull();
      expect(s.bytes).toBeNull();
    }
  });
});

describe('backupProblem', () => {
  const base = parseBackupStatus('{}');

  it('is null for a backup under 26 hours old', () => {
    expect(backupProblem({ ...base, lastSuccess: '2026-10-27T08:00:00Z' }, now)).toBeNull();
  });

  it('flags a backup over 26 hours old', () => {
    expect(backupProblem({ ...base, lastSuccess: '2026-10-27T06:00:00Z' }, now)).toBe(
      'The newest backup is 27 hours old.',
    );
    expect(
      backupProblem({ ...base, lastSuccess: '2026-10-20T06:00:00Z', lastError: 'pg_dump failed' }, now),
    ).toBe('The newest backup is 8 days old. Last error: pg_dump failed');
  });

  it('flags a missing backup', () => {
    expect(backupProblem(base, now)).toBe('No backup has been made yet.');
  });
});

describe('readBackupStatus', () => {
  it('reports an unmounted directory and a missing status file', async () => {
    expect((await readBackupStatus('/definitely/not/here')).mounted).toBe(false);
    const dir = await mkdtemp(path.join(tmpdir(), 'hoard-backups-'));
    try {
      expect(await readBackupStatus(dir)).toMatchObject({ mounted: true, lastSuccess: null });
      await writeFile(path.join(dir, 'status.json'), JSON.stringify({ lastSuccess: '2026-10-28T02:00:05Z' }));
      expect((await readBackupStatus(dir)).lastSuccess).toBe('2026-10-28T02:00:05Z');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('backupWarning', () => {
  const base = parseBackupStatus('{}');
  const h = 3_600_000;

  it('stays quiet about a missing first backup while the app is young', () => {
    expect(backupWarning(base, now, 2 * h)).toBeNull();
    expect(backupWarning(base, now, 27 * h)).toBe('No backup has been made yet.');
  });

  it('still warns about a stale backup right after a restart', () => {
    expect(backupWarning({ ...base, lastSuccess: '2026-10-25T06:00:00Z' }, now, 60_000)).toBe(
      'The newest backup is 3 days old.',
    );
    expect(backupWarning({ ...base, lastSuccess: '2026-10-28T02:00:00Z' }, now, 60_000)).toBeNull();
  });
});

describe('pickNewestDump', () => {
  it('picks the newest dump by mtime and ignores temp, empty and other files', () => {
    expect(pickNewestDump([])).toBeNull();
    expect(
      pickNewestDump([
        { file: 'hoard-20261027.dump', mtimeMs: 1000, bytes: 10 },
        { file: 'hoard-20261028.dump', mtimeMs: 3000, bytes: 20 },
        { file: 'hoard-20261029.dump.tmp', mtimeMs: 9000, bytes: 30 },
        { file: 'hoard-empty.dump', mtimeMs: 8000, bytes: 0 },
        { file: 'last-run', mtimeMs: 9500, bytes: 5 },
        { file: 'weekly/hoard-2026-10-25.dump', mtimeMs: 2000, bytes: 40 },
      ]),
    ).toEqual({ file: 'hoard-20261028.dump', mtimeMs: 3000, bytes: 20 });
  });

  it('turns a dump into a folder-sourced status', () => {
    const at = Date.parse('2026-10-28T03:17:00Z');
    expect(statusFromDump({ file: 'hoard-20261028.dump', mtimeMs: at, bytes: 45_000 })).toEqual({
      mounted: true,
      source: 'folder',
      lastSuccess: '2026-10-28T03:17:00.000Z',
      lastAttempt: '2026-10-28T03:17:00.000Z',
      lastError: null,
      file: 'hoard-20261028.dump',
      bytes: 45_000,
    });
    expect(statusFromDump(null)).toMatchObject({ mounted: true, source: null, lastSuccess: null });
  });
});

describe('readBackupStatus with dump files only', () => {
  it('uses the newest dump (top level, daily/ or weekly/) and prefers status.json', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hoard-backups-'));
    const touch = async (rel: string, iso: string) => {
      await writeFile(path.join(dir, rel), 'x'.repeat(100));
      const t = new Date(iso);
      await utimes(path.join(dir, rel), t, t);
    };
    try {
      await mkdir(path.join(dir, 'daily'));
      await touch('hoard-20261027.dump', '2026-10-27T03:17:00Z');
      await touch('daily/hoard-2026-10-28.dump', '2026-10-28T03:17:00Z');
      await touch('hoard-20261029.dump.tmp', '2026-10-29T03:17:00Z');
      expect(await readBackupStatus(dir)).toMatchObject({
        mounted: true,
        source: 'folder',
        lastSuccess: '2026-10-28T03:17:00.000Z',
        file: 'daily/hoard-2026-10-28.dump',
        bytes: 100,
        lastError: null,
      });
      await writeFile(path.join(dir, 'status.json'), JSON.stringify({ lastSuccess: '2026-10-20T02:00:05Z' }));
      expect(await readBackupStatus(dir)).toMatchObject({ source: 'status', lastSuccess: '2026-10-20T02:00:05Z' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
