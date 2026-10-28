import { describe, expect, it } from 'vitest';

import { todayYmd } from '@/lib/release';
import { releasesDueToday, type ReleaseRow } from '@/lib/releases-today';

const rows: ReleaseRow[] = [
  { activityId: 'm1', slug: 'movies', status: 'PLANNED', title: 'Dune 3', releaseDate: '2026-10-28' },
  { activityId: 'm2', slug: 'movies', status: 'PLANNED', title: 'Later', releaseDate: '2026-10-29' },
  { activityId: 'm3', slug: 'movies', status: 'COMPLETED', title: 'Seen', releaseDate: '2026-10-28' },
  { activityId: 't1', slug: 'tv', status: 'CONSUMING', title: 'Severance', nextAirDate: '2026-10-28' },
  { activityId: 't2', slug: 'tv', status: 'COMPLETED', title: 'Done show', nextAirDate: '2026-10-28' },
  // 23:30 UTC on 27 Oct = 00:30 on 28 Oct in Berlin, still 27 Oct in New York.
  { activityId: 'a1', slug: 'anime', status: 'CONSUMING', title: 'Frieren', nextAiringAt: new Date('2026-10-27T23:30:00Z'), nextAiringEpisode: 10 },
];

describe('releasesDueToday', () => {
  it('picks Planned releases and today’s episodes of what you watch', () => {
    const out = releasesDueToday(rows, '2026-10-28', 'Europe/Berlin');
    expect(out.map((n) => n.activityId)).toEqual(['m1', 't1', 'a1']);
    expect(out[0]).toMatchObject({ title: 'Out today: Dune 3', url: '/movies?open=m1', dedupeKey: 'release:m1:2026-10-28' });
    expect(out[2]).toMatchObject({ body: 'Episode 10 of Frieren airs today.', dedupeKey: 'episode:a1:2026-10-28' });
  });
  it('decides the anime airing day in the user’s own time zone', () => {
    expect(releasesDueToday(rows, '2026-10-27', 'America/New_York').map((n) => n.activityId)).toEqual(['a1']);
    expect(releasesDueToday(rows, '2026-10-27', 'Europe/Berlin').map((n) => n.activityId)).toEqual([]);
  });
  it('"today" itself comes from the user’s zone (00:30 Berlin is still yesterday in UTC)', () => {
    const now = new Date('2026-10-27T23:30:00Z');
    expect(todayYmd('Europe/Berlin', now)).toBe('2026-10-28');
    expect(todayYmd('UTC', now)).toBe('2026-10-27');
  });
});
