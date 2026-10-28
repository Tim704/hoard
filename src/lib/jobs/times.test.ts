import { describe, expect, it } from 'vitest';

import { parseAt } from '@/lib/jobs/schedule';
import { JOB_TIMES, TASTE_PROFILE_WEEKDAY } from '@/lib/jobs/times';

const minutes = (at: string) => {
  const t = parseAt(at)!;
  return t.hour * 60 + t.minute;
};

describe('job order', () => {
  it('refreshes airing anime only after the releases job has announced today', () => {
    expect(minutes(JOB_TIMES.airing)).toBeGreaterThan(minutes(JOB_TIMES.releases));
  });
  it('detects new seasons after the metadata refresh, before releases', () => {
    expect(minutes(JOB_TIMES['new-seasons'])).toBeGreaterThan(minutes(JOB_TIMES.metadata));
    expect(minutes(JOB_TIMES.releases)).toBeGreaterThan(minutes(JOB_TIMES['new-seasons']));
  });
  it('every time is a valid HH:MM', () => {
    for (const at of Object.values(JOB_TIMES)) expect(parseAt(at)).not.toBeNull();
  });
  it('builds taste profiles on Sundays at 05:45 (spec F3)', () => {
    expect(JOB_TIMES['taste-profile']).toBe('05:45');
    expect(TASTE_PROFILE_WEEKDAY).toBe(0);
  });
  it('runs the account syncs at their spec F3 times', () => {
    expect(JOB_TIMES.steam).toBe('04:30');
    expect(JOB_TIMES.lastfm).toBe('05:00');
    expect(JOB_TIMES['anilist-sync']).toBe('05:30');
  });
});
