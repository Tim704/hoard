import { describe, expect, it } from 'vitest';

import { entry, statTitle } from './fixtures';
import { addMonths, comparePair, parseRange, periodSummary } from './compare';

describe('addMonths', () => {
  it('clamps to the last day of the target month', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2026-01-15', -3)).toBe('2025-10-15');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('comparePair', () => {
  it('year: this calendar year vs last', () => {
    expect(comparePair('year', '2026-10-28')).toMatchObject({
      preset: 'year',
      a: { from: '2026-01-01', to: '2026-12-31', label: '2026' },
      b: { from: '2025-01-01', to: '2025-12-31', label: '2025' },
    });
  });

  it('quarter: the last 3 months vs the 3 before, back to back', () => {
    const p = comparePair('quarter', '2026-10-28');
    expect(p.a).toMatchObject({ from: '2026-07-29', to: '2026-10-28' });
    expect(p.b).toMatchObject({ from: '2026-04-29', to: '2026-07-28' });
  });

  it('quarter across a year end and a short month', () => {
    const p = comparePair('quarter', '2026-05-31');
    expect(p.a).toMatchObject({ from: '2026-03-01', to: '2026-05-31' });
    expect(p.b).toMatchObject({ from: '2025-11-29', to: '2026-02-28' });
  });

  it('custom ranges, falling back to the year preset when invalid', () => {
    const ok = comparePair('custom', '2026-10-28', { a: ['2026-01-01', '2026-03-31'], b: ['2025-01-01', '2025-03-31'] });
    expect(ok).toMatchObject({ preset: 'custom', a: { from: '2026-01-01', to: '2026-03-31' } });
    expect(comparePair('custom', '2026-10-28', { a: ['2026-03-31', '2026-01-01'], b: ['2025-01-01', '2025-03-31'] }).preset).toBe('year');
    expect(comparePair('custom', '2026-10-28', { a: ['2026-02-30', '2026-03-01'], b: ['2025-01-01', '2025-03-31'] }).preset).toBe('year');
    expect(comparePair('nonsense', '2026-10-28').preset).toBe('year');
  });
});

describe('parseRange', () => {
  it('rejects reversed, invalid and enormous ranges', () => {
    expect(parseRange('2026-01-01', '2026-01-01')).toEqual({ from: '2026-01-01', to: '2026-01-01' });
    expect(parseRange('2026-01-02', '2026-01-01')).toBeNull();
    expect(parseRange('1900-01-01', '2026-01-01')).toBeNull();
    expect(parseRange(1, '2026-01-01')).toBeNull();
  });
});

describe('periodSummary', () => {
  it('counts, averages, genres and hours inside the range only', () => {
    const a = statTitle({ category: 'movies', rating: 8, media: { runtime: 120, genres: ['Drama'] } });
    const b = statTitle({ category: 'books', rating: 6, media: { genres: ['Drama', 'Fantasy'] } });
    const c = statTitle({ category: 'movies', rating: 2, media: { runtime: 600 } });
    const s = periodSummary([a, b, c], [entry(a, '2026-02-01'), entry(b, '2026-03-31'), entry(c, '2026-04-01')], {
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(s.finished).toBe(2);
    expect(s.perSection.find((x) => x.slug === 'movies')?.finished).toBe(1);
    expect(s.avgScore).toBe(7);
    expect(s.hours).toBe(2);
    expect(s.topGenres.map((g) => g.genre)).toEqual(['Drama', 'Fantasy']);
  });
});
