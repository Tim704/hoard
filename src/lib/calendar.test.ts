import { describe, expect, it } from 'vitest';

import {
  addDays,
  feedWindow,
  itemsByDay,
  monthBounds,
  monthGrid,
  parseMonth,
  shiftMonth,
  weekdayLabels,
  weekdayOf,
  type CalendarItem,
} from '@/lib/calendar';

describe('month grid and week start', () => {
  it('starts weeks on Monday (weekStart 1): November 2026 begins on Sunday', () => {
    const weeks = monthGrid(2026, 11, 1);
    expect(weeks[0][0]).toBe('2026-10-26'); // Monday before
    expect(weeks[0][6]).toBe('2026-11-01');
    expect(weeks[weeks.length - 1][6]).toBe('2026-12-06');
    expect(weeks.every((w) => w.length === 7 && weekdayOf(w[0]) === 1)).toBe(true);
    expect(weekdayLabels(1)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });
  it('starts weeks on Sunday (weekStart 0)', () => {
    const weeks = monthGrid(2026, 11, 0);
    expect(weeks[0][0]).toBe('2026-11-01');
    expect(weeks.every((w) => weekdayOf(w[0]) === 0)).toBe(true);
    expect(weekdayLabels(0)[0]).toBe('Sun');
  });
  it('any start day covers the whole month in whole weeks', () => {
    for (let start = 0; start < 7; start++) {
      const days = monthGrid(2027, 2, start).flat();
      expect(days.length % 7).toBe(0);
      expect(days).toContain('2027-02-01');
      expect(days).toContain('2027-02-28');
      expect(weekdayOf(days[0])).toBe(start);
    }
  });
  it('day and month maths', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthBounds(2024, 2)).toEqual({ first: '2024-02-01', last: '2024-02-29' });
    expect(parseMonth('2026-11')).toEqual({ year: 2026, month: 11 });
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('nope')).toBeNull();
    expect(feedWindow('2026-10-28')).toEqual({ from: '2026-10-21', to: '2027-04-26' });
  });
});

describe('itemsByDay', () => {
  const item = (uid: string, date: string, kind: CalendarItem['kind'], title: string): CalendarItem => ({
    uid, date, kind, title, detail: '', slug: 'movies', href: null, imageUrl: null,
  });
  it('groups by day in date order, releases before episodes', () => {
    const map = itemsByDay([
      item('b', '2026-11-02', 'episode', 'B'),
      item('a', '2026-11-02', 'release', 'Z'),
      item('c', '2026-11-01', 'sequel', 'C'),
    ]);
    expect([...map.keys()]).toEqual(['2026-11-01', '2026-11-02']);
    expect(map.get('2026-11-02')!.map((i) => i.uid)).toEqual(['a', 'b']);
  });
});
