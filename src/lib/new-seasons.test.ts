import { describe, expect, it } from 'vitest';

import { pickSequelFranchises, planSeasonNotices, seasonNotification } from '@/lib/jobs/new-seasons';
import { canGetSeasons, newAiredSeasons, newSeasonBadge, newSeasonKey, recordsSeenSeasons } from '@/lib/new-seasons';

const seasons = [
  { seasonNumber: 1, airDate: '2020-01-01' },
  { seasonNumber: 2, airDate: '2022-01-01' },
  { seasonNumber: 3, airDate: '2026-10-28' },
  { seasonNumber: 4, airDate: '2027-03-01' },
];

describe('newAiredSeasons', () => {
  it('finds seasons past the seen count that have aired by today', () => {
    expect(newAiredSeasons({ seenSeasonCount: 2, seasonCount: 4, seasons }, '2026-10-28')).toEqual([3]);
    expect(newAiredSeasons({ seenSeasonCount: 1, seasonCount: 4, seasons }, '2027-03-01')).toEqual([2, 3, 4]);
  });
  it('waits for the air date (the day before is not new yet)', () => {
    expect(newAiredSeasons({ seenSeasonCount: 2, seasonCount: 4, seasons }, '2026-10-27')).toEqual([]);
  });
  it('ignores unknown air dates, unrecorded counts and seasons beyond seasonCount', () => {
    expect(newAiredSeasons({ seenSeasonCount: 2, seasonCount: 3, seasons: [{ seasonNumber: 3, airDate: null }] }, '2030-01-01')).toEqual([]);
    expect(newAiredSeasons({ seenSeasonCount: null, seasonCount: 4, seasons }, '2030-01-01')).toEqual([]);
    expect(newAiredSeasons({ seenSeasonCount: 2, seasonCount: 2, seasons }, '2030-01-01')).toEqual([]);
    expect(newAiredSeasons({ seenSeasonCount: 2, seasonCount: 3, seasons }, '2030-01-01')).toEqual([3]);
  });
  it('the badge shows the newest aired one', () => {
    expect(newSeasonBadge({ seenSeasonCount: 1, seasonCount: 4, seasons }, '2026-12-01')).toBe(3);
    expect(newSeasonBadge({ seenSeasonCount: 3, seasonCount: 4, seasons }, '2026-12-01')).toBeNull();
  });
});

describe('recording and status rules', () => {
  it('finishing or starting a show records the count; other changes do not', () => {
    expect(recordsSeenSeasons('tv', 'PLANNED', 'COMPLETED')).toBe(true);
    expect(recordsSeenSeasons('TV', 'COMPLETED', 'CONSUMING')).toBe(true);
    expect(recordsSeenSeasons('tv', null, 'COMPLETED')).toBe(true);
    expect(recordsSeenSeasons('tv', 'COMPLETED', 'COMPLETED')).toBe(false);
    expect(recordsSeenSeasons('tv', 'CONSUMING', 'DROPPED')).toBe(false);
    expect(recordsSeenSeasons('movies', 'PLANNED', 'COMPLETED')).toBe(false);
  });
  it('Ended and Canceled shows get no new seasons', () => {
    expect(canGetSeasons('Ended')).toBe(false);
    expect(canGetSeasons('Canceled')).toBe(false);
    expect(canGetSeasons('Returning Series')).toBe(true);
    expect(canGetSeasons(null)).toBe(true);
  });
});

describe('planSeasonNotices', () => {
  const row = { activityId: 'a1', userId: 'u1', title: 'Severance', seasonCount: 3, seasons };
  it('baselines finished shows without a recorded count, silently', () => {
    const plan = planSeasonNotices([{ ...row, seenSeasonCount: null }], '2030-01-01');
    expect(plan.baseline).toEqual([{ activityId: 'a1', seasonCount: 3 }]);
    expect(plan.notices).toEqual([]);
  });
  it('one notice per aired new season, with a per-(activity, season) dedupe key', () => {
    const plan = planSeasonNotices([{ ...row, seenSeasonCount: 1 }], '2026-10-28');
    expect(plan.notices.map((n) => n.season)).toEqual([2, 3]);
    const keys = plan.notices.map((n) => seasonNotification(n).dedupeKey);
    expect(keys).toEqual([newSeasonKey('a1', 2), newSeasonKey('a1', 3)]);
    // A re-run plans the same keys, which notify() then skips as duplicates.
    expect(planSeasonNotices([{ ...row, seenSeasonCount: 1 }], '2026-10-28').notices.map((n) => seasonNotification(n).dedupeKey)).toEqual(keys);
    expect(seasonNotification(plan.notices[1])).toMatchObject({
      kind: 'new-seasons',
      title: 'New season: Severance',
      body: 'Season 3 of Severance is out.',
      url: '/tv?open=a1',
    });
  });
});

describe('pickSequelFranchises', () => {
  it('never-refreshed franchises first, then the oldest', () => {
    const rows = [
      { id: 'new', upcoming: { fetchedAt: '2026-10-20T00:00:00Z', items: [] } },
      { id: 'never', upcoming: null },
      { id: 'old', upcoming: { fetchedAt: '2026-09-01T00:00:00Z', items: [] } },
    ];
    expect(pickSequelFranchises(rows, 2).map((r) => r.id)).toEqual(['never', 'old']);
  });
});
