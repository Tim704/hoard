import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { backupProblem, backupWarning, parseBackupStatus, readBackupStatus } from './backups';

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
