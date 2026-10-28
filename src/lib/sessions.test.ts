import { describe, expect, it } from 'vitest';

import { formatMinutes, groupByMonth, groupRuns, monthGrid, shiftMonth, timesLine } from './sessions';

describe('groupRuns', () => {
  it('groups sessions less than 7 days apart into one run', () => {
    const runs = groupRuns([
      { date: '2026-03-10', minutes: 60 },
      { date: '2026-03-01', minutes: 30 },
      { date: '2026-03-04', minutes: null },
      // 6 days after the 10th: same run.
      { date: '2026-03-16', minutes: 15 },
      // 7 days after the 16th: a new run.
      { date: '2026-03-23', minutes: 45 },
      { date: '2026-05-01', minutes: null },
    ]);
    expect(runs.map((r) => [r.start, r.end, r.sessions.length, r.minutes])).toEqual([
      ['2026-03-01', '2026-03-16', 4, 105],
      ['2026-03-23', '2026-03-23', 1, 45],
      ['2026-05-01', '2026-05-01', 1, 0],
    ]);
  });

  it('crosses month and year ends by day count, and copes with nothing', () => {
    expect(groupRuns([{ date: '2025-12-29', minutes: 1 }, { date: '2026-01-03', minutes: 1 }])).toHaveLength(1);
    expect(groupRuns([])).toEqual([]);
    // Two sessions on one day are one run.
    expect(groupRuns([{ date: '2026-01-03', minutes: 1 }, { date: '2026-01-03', minutes: 2 }])[0].minutes).toBe(3);
  });
});

describe('monthGrid', () => {
  it('lays a month out in weeks from the chosen week start', () => {
    // March 2026 starts on a Sunday.
    const monday = monthGrid(2026, 3, 1);
    expect(monday[0]).toEqual([null, null, null, null, null, null, '2026-03-01']);
    expect(monday.flat().filter(Boolean)).toHaveLength(31);
    expect(monday.every((w) => w.length === 7)).toBe(true);
    const sunday = monthGrid(2026, 3, 0);
    expect(sunday[0][0]).toBe('2026-03-01');
    expect(monthGrid(2028, 2, 1).flat().filter(Boolean)).toHaveLength(29); // leap year
  });

  it('shifts months across years', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });
});

describe('diary views', () => {
  it('groups entries by month, newest first', () => {
    const groups = groupByMonth([
      { id: 'a', date: '2026-03-02' },
      { id: 'b', date: '2026-04-10' },
      { id: 'c', date: '2026-03-20' },
    ]);
    expect(groups.map((g) => [g.key, g.label, g.entries.map((e) => e.id)])).toEqual([
      ['2026-04', 'April 2026', ['b']],
      ['2026-03', 'March 2026', ['c', 'a']],
    ]);
  });

  it('says how often and when last', () => {
    expect(timesLine('movies', ['2026-03-12', '2025-01-01', '2024-05-05'])).toBe('Watched 3× · last 12 Mar 2026');
    expect(timesLine('books', ['2026-03-12'])).toBe('Read once · 12 Mar 2026');
    expect(timesLine('games', [])).toBeNull();
  });

  it('formats minutes', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(125)).toBe('2 h 5 min');
  });
});
