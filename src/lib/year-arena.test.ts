import { describe, expect, it } from 'vitest';

import { parseYear, rankYear, yearBounds, yearsOf } from './year-arena';

describe('parseYear', () => {
  it('accepts four-digit years in range', () => {
    expect(parseYear('2026')).toBe(2026);
    expect(parseYear(1999)).toBe(1999);
  });
  it('rejects everything else', () => {
    for (const v of ['26', '20260', 'abcd', '1899', '3000', 2026.5, null, undefined, '', ' 2026']) {
      expect(parseYear(v)).toBeNull();
    }
  });
});

describe('yearBounds / yearsOf', () => {
  it('covers the whole calendar year', () => {
    expect(yearBounds(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('lists distinct years newest first and skips junk', () => {
    expect(yearsOf(['2024-06-02', '2026-01-01', '2024-12-31', 'nope', '2026-10-28'])).toEqual([2026, 2024]);
  });
  it('a 31 December entry belongs to its own year (calendar-day strings, no UTC shift)', () => {
    expect(yearsOf(['2025-12-31'])).toEqual([2025]);
  });
});

describe('rankYear', () => {
  const t = (id: string, elo: number, rating: number | null = null) => ({ id, elo, duels: 0, rating, media: { title: id } });
  it('orders by year Elo, then score, then title', () => {
    const order = rankYear([t('c', 1200, 7), t('a', 1200, 9), t('b', 1216), t('d', 1200)]).map((x) => x.id);
    expect(order).toEqual(['b', 'a', 'c', 'd']);
  });
});
