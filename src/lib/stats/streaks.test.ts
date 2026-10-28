import { describe, expect, it } from 'vitest';

import { daysOf, streaks } from './streaks';

describe('daysOf (time zones, G10)', () => {
  it('00:30 Berlin belongs to that Berlin day, not the previous UTC day', () => {
    const at = new Date('2026-03-11T23:30:00Z');
    expect([...daysOf([at], 'Europe/Berlin')]).toEqual(['2026-03-12']);
    expect([...daysOf([at], 'UTC')]).toEqual(['2026-03-11']);
    expect([...daysOf([at], 'America/Los_Angeles')]).toEqual(['2026-03-11']);
  });

  it('de-duplicates instants on the same local day', () => {
    const days = daysOf([new Date('2026-07-01T05:00:00Z'), new Date('2026-07-01T20:00:00Z')], 'Europe/Berlin');
    expect([...days]).toEqual(['2026-07-01']);
  });

  it('falls back to UTC for an unknown zone', () => {
    expect([...daysOf([new Date('2026-07-01T23:30:00Z')], 'Not/AZone')]).toEqual(['2026-07-01']);
  });
});

describe('streaks', () => {
  it('counts the current run ending today', () => {
    expect(streaks(['2026-10-26', '2026-10-27', '2026-10-28'], '2026-10-28')).toMatchObject({ current: 3, longest: 3, activeDays: 3 });
  });

  it('keeps the current run alive when today has nothing yet', () => {
    expect(streaks(['2026-10-26', '2026-10-27'], '2026-10-28').current).toBe(2);
  });

  it('a missed whole day ends the current run', () => {
    expect(streaks(['2026-10-25', '2026-10-26'], '2026-10-28').current).toBe(0);
  });

  it('finds the longest run anywhere, the latest on ties', () => {
    const s = streaks(['2026-01-01', '2026-01-02', '2026-01-03', '2026-02-10', '2026-03-01', '2026-03-02', '2026-03-03', '2026-10-28'], '2026-10-28');
    expect(s).toMatchObject({ current: 1, longest: 3, longestEnd: '2026-03-03' });
  });

  it('spans a month, a year and a leap day', () => {
    expect(streaks(['2023-12-31', '2024-01-01', '2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01')).toMatchObject({
      current: 3,
      longest: 3,
    });
  });

  it('is not broken by DST: the spring-forward and fall-back days are ordinary days', () => {
    // Europe/Berlin switches on 2026-03-29 (23 h) and 2026-10-25 (25 h); 23:30 local
    // is 22:30 UTC before the spring switch and 21:30 UTC after it.
    const spring = daysOf(
      [new Date('2026-03-28T22:30:00Z'), new Date('2026-03-29T21:30:00Z'), new Date('2026-03-30T21:30:00Z')],
      'Europe/Berlin',
    );
    expect([...spring]).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
    expect(streaks(spring, '2026-03-30')).toMatchObject({ current: 3, longest: 3 });

    const fall = daysOf(
      [new Date('2026-10-24T22:30:00Z'), new Date('2026-10-25T23:30:00Z'), new Date('2026-10-26T23:30:00Z')],
      'Europe/Berlin',
    );
    expect([...fall]).toEqual(['2026-10-25', '2026-10-26', '2026-10-27']);
    expect(streaks(fall, '2026-10-28').current).toBe(3);
  });

  it('the same instants give different streaks in different zones', () => {
    // 23:30 UTC on two consecutive days, plus 00:30 UTC two days later.
    const at = [new Date('2026-06-01T23:30:00Z'), new Date('2026-06-02T23:30:00Z'), new Date('2026-06-04T00:30:00Z')];
    // Berlin: 06-02, 06-03, 06-04 → one run of 3.
    expect(streaks(daysOf(at, 'Europe/Berlin'), '2026-06-04')).toMatchObject({ current: 3, longest: 3 });
    // UTC: 06-01, 06-02, 06-04 → a gap.
    expect(streaks(daysOf(at, 'UTC'), '2026-06-04')).toMatchObject({ current: 1, longest: 2 });
  });

  it('ignores future days and junk, and is empty without days', () => {
    expect(streaks(['2026-10-29', 'nope'], '2026-10-28')).toEqual({ current: 0, longest: 0, longestEnd: null, activeDays: 0 });
    expect(streaks([], '2026-10-28').current).toBe(0);
  });
});
