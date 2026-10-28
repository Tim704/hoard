import { describe, expect, it } from 'vitest';

import {
  daysUntil,
  formatYmd,
  isReleased,
  isYmd,
  normalizeYmd,
  todayYmd,
  ymdFromParts,
} from './release';

const TODAY = '2026-10-28';

describe('isReleased', () => {
  it('uses the full date when known', () => {
    expect(isReleased({ releaseDate: '2026-10-27', year: 2026 }, TODAY)).toBe(true);
    expect(isReleased({ releaseDate: '2026-10-28', year: 2026 }, TODAY)).toBe(true);
    expect(isReleased({ releaseDate: '2026-10-29', year: 2026 }, TODAY)).toBe(false);
    expect(isReleased({ releaseDate: '2027-01-05', year: 2027 }, TODAY)).toBe(false);
  });

  it('counts a year-only title as out unless the year is in the future', () => {
    expect(isReleased({ releaseDate: null, year: 2025 }, TODAY)).toBe(true);
    // The current year counts as out, even if the real day is in December.
    expect(isReleased({ releaseDate: null, year: 2026 }, TODAY)).toBe(true);
    expect(isReleased({ releaseDate: null, year: 2027 }, TODAY)).toBe(false);
  });

  it('treats a title with no date and no year as out', () => {
    expect(isReleased({}, TODAY)).toBe(true);
    expect(isReleased({ releaseDate: null, year: null }, TODAY)).toBe(true);
  });

  it('ignores a malformed date and falls back to the year', () => {
    expect(isReleased({ releaseDate: '2027-02-30', year: 2025 }, TODAY)).toBe(true);
    expect(isReleased({ releaseDate: '2027', year: 2027 }, TODAY)).toBe(false);
  });
});

describe('daysUntil', () => {
  it('counts whole calendar days to a future date', () => {
    expect(daysUntil({ releaseDate: '2026-10-29' }, TODAY)).toBe(1);
    expect(daysUntil({ releaseDate: '2026-11-09' }, TODAY)).toBe(12);
    expect(daysUntil({ releaseDate: '2027-10-28' }, TODAY)).toBe(365);
  });

  it('is 0 on release day and null once past', () => {
    expect(daysUntil({ releaseDate: TODAY }, TODAY)).toBe(0);
    expect(daysUntil({ releaseDate: '2026-10-27' }, TODAY)).toBeNull();
  });

  it('is null when only the year is known', () => {
    expect(daysUntil({ releaseDate: null, year: 2027 }, TODAY)).toBeNull();
    expect(daysUntil({}, TODAY)).toBeNull();
  });

  it('is not thrown off by a DST change in between', () => {
    // Europe/Berlin leaves summer time on 25 Oct 2026.
    expect(daysUntil({ releaseDate: '2026-10-26' }, '2026-10-24')).toBe(2);
  });
});

describe('todayYmd', () => {
  it('uses the Berlin day, not the UTC day, around midnight', () => {
    // 00:30 in Berlin (CET, UTC+1) on 28 Oct is still 27 Oct in UTC.
    const now = new Date('2026-10-27T23:30:00Z');
    expect(todayYmd('Europe/Berlin', now)).toBe('2026-10-28');
    expect(todayYmd('UTC', now)).toBe('2026-10-27');
    // A title out on the 28th is out at 00:30 Berlin time.
    expect(isReleased({ releaseDate: '2026-10-28' }, todayYmd('Europe/Berlin', now))).toBe(true);
    expect(isReleased({ releaseDate: '2026-10-28' }, todayYmd('UTC', now))).toBe(false);
  });

  it('handles summer time and falls back to UTC for a bad zone', () => {
    expect(todayYmd('Europe/Berlin', new Date('2026-07-01T22:15:00Z'))).toBe('2026-07-02');
    expect(todayYmd('Not/AZone', new Date('2026-07-01T22:15:00Z'))).toBe('2026-07-01');
  });
});

describe('date helpers', () => {
  it('validates YYYY-MM-DD', () => {
    expect(isYmd('2024-02-29')).toBe(true);
    expect(isYmd('2025-02-29')).toBe(false);
    expect(isYmd('2025-1-01')).toBe(false);
    expect(isYmd(null)).toBe(false);
  });

  it('builds a day only from complete parts', () => {
    expect(ymdFromParts(2023, 9, 29)).toBe('2023-09-29');
    expect(ymdFromParts(2023, 9, null)).toBeNull();
    expect(ymdFromParts(2023, null, null)).toBeNull();
    expect(ymdFromParts(2023, 2, 31)).toBeNull();
  });

  it('normalizes provider strings', () => {
    expect(normalizeYmd('1999-03-30')).toBe('1999-03-30');
    expect(normalizeYmd('2011-04-17T00:00:00Z')).toBe('2011-04-17');
    expect(normalizeYmd('')).toBeNull();
    expect(normalizeYmd('2027')).toBeNull();
  });

  it('formats a day without shifting it', () => {
    expect(formatYmd('2026-10-28')).toBe('28 Oct 2026');
  });
});
