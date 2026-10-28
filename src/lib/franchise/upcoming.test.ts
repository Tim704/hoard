import { describe, expect, it } from 'vitest';

import { extractUpcoming, parseUpcoming, type StatusNode } from '@/lib/franchise/upcoming';

const node = (id: number, over: Partial<StatusNode>): StatusNode => ({
  id,
  idMal: null,
  type: 'ANIME',
  format: 'TV',
  title: { english: `Title ${id}`, romaji: `Romaji ${id}` },
  status: 'NOT_YET_RELEASED',
  startDate: { year: 2027, month: 1, day: 10 },
  ...over,
});

describe('extractUpcoming', () => {
  it('keeps announced entries with a full start day, soonest first', () => {
    const out = extractUpcoming(
      [
        node(1, { status: 'FINISHED' }),
        node(2, { startDate: { year: 2027, month: 4, day: 1 }, idMal: 555 }),
        node(3, {}),
        node(4, { startDate: { year: 2027, month: null, day: null } }), // only a year
        node(5, { isAdult: true }),
        node(6, { format: 'MUSIC' }),
        node(7, { type: 'MANGA', format: 'MANGA', startDate: { year: 2026, month: 12, day: 1 } }),
        node(8, { startDate: { year: 2026, month: 1, day: 1 } }), // stale past date
        node(3, {}), // duplicate
      ],
      '2026-10-28',
    );
    expect(out.map((e) => `${e.slug}:${e.externalId}:${e.date}`)).toEqual([
      'manga:al-7:2026-12-01',
      'anime:al-3:2027-01-10',
      'anime:555:2027-04-01',
    ]);
    expect(out[1]).toMatchObject({ title: 'Title 3', format: 'TV' });
  });
});

describe('parseUpcoming', () => {
  it('reads the cache defensively', () => {
    expect(parseUpcoming(null)).toBeNull();
    const parsed = parseUpcoming({
      fetchedAt: '2026-10-28T04:00:00Z',
      items: [
        { slug: 'anime', externalId: '1', title: 'A', date: '2027-01-01', imageUrl: null, format: 'TV' },
        { slug: 'books', externalId: '2', title: 'B', date: '2027-01-01' },
        { slug: 'anime', externalId: '3', title: 'C', date: '2027-02-30' },
      ],
    });
    expect(parsed?.items.map((i) => i.externalId)).toEqual(['1']);
    expect(parsed?.fetchedAt).toBe('2026-10-28T04:00:00Z');
  });
});
