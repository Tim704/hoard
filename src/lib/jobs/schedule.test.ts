import { describe, expect, it } from 'vitest';

import {
  dueJobs,
  jobLockKey,
  lastOccurrence,
  parseAt,
  zonedTimeToUtc,
  type JobSchedule,
} from './schedule';

const TZ = 'Europe/Berlin';
const iso = (s: string) => new Date(s);

const backupWatch: JobSchedule = { name: 'backup-watch', at: '09:00' };
const nightly: JobSchedule = { name: 'nightly', at: '02:30' };
const weekly: JobSchedule = { name: 'taste-profile', at: '05:45', weekday: 0 };
const migration: JobSchedule = { name: 'migration', at: 'startup' };

/** Simulate the scheduler ticking every minute from `from` to `to`. */
function simulate(jobs: JobSchedule[], from: Date, to: Date, lastRuns: Record<string, Date> = {}) {
  const runs: { name: string; at: Date }[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 60_000) {
    const now = new Date(t);
    for (const name of dueJobs(now, TZ, jobs, lastRuns)) {
      runs.push({ name, at: now });
      lastRuns[name] = now;
    }
  }
  return runs;
}

describe('parseAt', () => {
  it('parses HH:MM and rejects the rest', () => {
    expect(parseAt('09:00')).toEqual({ hour: 9, minute: 0 });
    expect(parseAt('5:45')).toEqual({ hour: 5, minute: 45 });
    expect(parseAt('24:00')).toBeNull();
    expect(parseAt('12:60')).toBeNull();
    expect(parseAt('startup')).toBeNull();
  });
});

describe('zonedTimeToUtc', () => {
  it('uses winter and summer offsets', () => {
    expect(new Date(zonedTimeToUtc(2026, 1, 15, 9, 0, TZ)).toISOString()).toBe('2026-01-15T08:00:00.000Z');
    expect(new Date(zonedTimeToUtc(2026, 7, 15, 9, 0, TZ)).toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });

  it('moves a time skipped by spring-forward to after the gap', () => {
    // 29 Mar 2026: 02:00 CET jumps to 03:00 CEST, so 02:30 does not exist.
    expect(new Date(zonedTimeToUtc(2026, 3, 29, 2, 30, TZ)).toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('gives one instant for a time that happens twice on fall-back day', () => {
    // 25 Oct 2026: 03:00 CEST falls back to 02:00 CET, so 02:30 happens twice.
    const ms = zonedTimeToUtc(2026, 10, 25, 2, 30, TZ);
    expect(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']).toContain(new Date(ms).toISOString());
  });
});

describe('lastOccurrence', () => {
  it('is today once the time has passed, yesterday before', () => {
    expect(lastOccurrence(backupWatch, iso('2026-07-15T07:00:00Z'), TZ)?.toISOString()).toBe(
      '2026-07-15T07:00:00.000Z',
    );
    expect(lastOccurrence(backupWatch, iso('2026-07-15T06:59:00Z'), TZ)?.toISOString()).toBe(
      '2026-07-14T07:00:00.000Z',
    );
  });

  it('finds the last matching weekday', () => {
    // Wed 28 Oct 2026 → Sunday 25 Oct 05:45 CET.
    expect(lastOccurrence(weekly, iso('2026-10-28T12:00:00Z'), TZ)?.toISOString()).toBe(
      '2026-10-25T04:45:00.000Z',
    );
  });

  it('is null for startup jobs', () => {
    expect(lastOccurrence(migration, iso('2026-10-28T12:00:00Z'), TZ)).toBeNull();
  });
});

describe('dueJobs', () => {
  it('never lists startup jobs', () => {
    expect(dueJobs(iso('2026-10-28T12:00:00Z'), TZ, [migration], {})).toEqual([]);
  });

  it('runs a job that never ran', () => {
    expect(dueJobs(iso('2026-10-28T12:00:00Z'), TZ, [backupWatch], {})).toEqual(['backup-watch']);
  });

  it('runs at the local time, then not again the same day', () => {
    const lastRuns = { 'backup-watch': iso('2026-10-27T08:00:10Z') };
    expect(dueJobs(iso('2026-10-28T07:59:00Z'), TZ, [backupWatch], lastRuns)).toEqual([]);
    expect(dueJobs(iso('2026-10-28T08:00:00Z'), TZ, [backupWatch], lastRuns)).toEqual(['backup-watch']);
    const after = { 'backup-watch': iso('2026-10-28T08:00:00Z') };
    expect(dueJobs(iso('2026-10-28T20:00:00Z'), TZ, [backupWatch], after)).toEqual([]);
  });

  it('catches up a missed run once after a restart, not once per missed day', () => {
    // Last ran Sunday 09:00; the server was down until Wednesday noon.
    const runs = simulate(
      [backupWatch],
      iso('2026-10-28T11:00:00Z'),
      iso('2026-10-28T23:59:00Z'),
      { 'backup-watch': iso('2026-10-25T08:00:00Z') },
    );
    expect(runs.map((r) => r.at.toISOString())).toEqual(['2026-10-28T11:00:00.000Z']);
  });

  it('runs exactly once a day across the March DST change (Europe/Berlin)', () => {
    const runs = simulate(
      [backupWatch, nightly],
      iso('2026-03-27T23:00:00Z'), // Sat 28 Mar 00:00 CET
      iso('2026-03-30T21:59:00Z'), // Mon 30 Mar 23:59 CEST
      { 'backup-watch': iso('2026-03-27T08:00:00Z'), nightly: iso('2026-03-27T01:30:00Z') },
    );
    expect(runs.filter((r) => r.name === 'backup-watch').map((r) => r.at.toISOString())).toEqual([
      '2026-03-28T08:00:00.000Z', // 09:00 CET
      '2026-03-29T07:00:00.000Z', // 09:00 CEST
      '2026-03-30T07:00:00.000Z',
    ]);
    // 02:30 does not exist on 29 Mar: it runs at 03:30 CEST instead, once.
    expect(runs.filter((r) => r.name === 'nightly').map((r) => r.at.toISOString())).toEqual([
      '2026-03-28T01:30:00.000Z',
      '2026-03-29T01:30:00.000Z',
      '2026-03-30T00:30:00.000Z',
    ]);
  });

  it('runs exactly once a day across the October DST change (Europe/Berlin)', () => {
    const runs = simulate(
      [backupWatch, nightly],
      iso('2026-10-23T22:00:00Z'), // Sat 24 Oct 00:00 CEST
      iso('2026-10-26T22:59:00Z'), // Mon 26 Oct 23:59 CET
      { 'backup-watch': iso('2026-10-23T07:00:00Z'), nightly: iso('2026-10-23T00:30:00Z') },
    );
    expect(runs.filter((r) => r.name === 'backup-watch').map((r) => r.at.toISOString())).toEqual([
      '2026-10-24T07:00:00.000Z', // 09:00 CEST
      '2026-10-25T08:00:00.000Z', // 09:00 CET
      '2026-10-26T08:00:00.000Z',
    ]);
    // 02:30 happens twice on 25 Oct but the job runs once.
    expect(runs.filter((r) => r.name === 'nightly')).toHaveLength(3);
  });

  it('runs a weekly job once a week', () => {
    const runs = simulate(
      [weekly],
      iso('2026-10-19T00:00:00Z'),
      iso('2026-11-02T00:00:00Z'),
      { 'taste-profile': iso('2026-10-18T04:45:00Z') },
    );
    expect(runs.map((r) => r.at.toISOString())).toEqual([
      '2026-10-25T04:45:00.000Z', // Sunday 05:45 CET
      '2026-11-01T04:45:00.000Z',
    ]);
  });
});

describe('jobLockKey', () => {
  it('is a stable signed 32-bit integer that differs per name', () => {
    const k = jobLockKey('backup-watch');
    expect(k).toBe(jobLockKey('backup-watch'));
    expect(Number.isInteger(k)).toBe(true);
    expect(k).toBeGreaterThanOrEqual(-(2 ** 31));
    expect(k).toBeLessThan(2 ** 31);
    expect(jobLockKey('migration')).not.toBe(k);
  });
});
