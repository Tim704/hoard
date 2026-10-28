import { describe, expect, it } from 'vitest';

import { entry, statTitle } from './fixtures';
import { avgScoreByYear, crowdOverview, dropRates, finishedPerMonth, statusMix, topGenres } from './charts';

describe('finishedPerMonth', () => {
  it('stacks finishes per month by section, in navigation order', () => {
    const m = statTitle({ category: 'movies' });
    const b = statTitle({ category: 'books' });
    const d = statTitle({ category: 'tv', status: 'DROPPED' });
    const res = finishedPerMonth([m, b, d], [entry(m, '2026-01-05'), entry(m, '2026-01-25'), entry(b, '2026-12-31'), entry(d, '2026-01-01'), entry(b, '2025-01-01')], 2026);
    expect(res.sections).toEqual(['books', 'movies']);
    expect(res.months).toHaveLength(12);
    expect(res.months[0]).toEqual({ month: 1, counts: { movies: 2 }, total: 2 });
    expect(res.months[11]).toEqual({ month: 12, counts: { books: 1 }, total: 1 });
  });
});

describe('topGenres', () => {
  it('counts finished titles per genre, case-insensitively, top n', () => {
    const list = [
      statTitle({ rating: 8, media: { genres: ['Drama', 'drama'] } }),
      statTitle({ rating: 6, media: { genres: ['DRAMA', 'Comedy'] } }),
      statTitle({ status: 'PLANNED', media: { genres: ['Horror'] } }),
      statTitle({ rating: 9, media: { genres: ['Thriller'] } }),
    ];
    expect(topGenres(list)).toEqual([
      { genre: 'Drama', count: 2, avgScore: 7 },
      { genre: 'Thriller', count: 1, avgScore: 9 },
      { genre: 'Comedy', count: 1, avgScore: 6 },
    ]);
    expect(topGenres(list, 1)).toHaveLength(1);
  });
});

describe('avgScoreByYear', () => {
  it('uses the diary score, else the title score, per year', () => {
    const a = statTitle({ rating: 6 });
    const b = statTitle({ rating: null });
    const res = avgScoreByYear([a, b], [entry(a, '2025-01-01', 9), entry(a, '2026-01-01'), entry(b, '2026-02-01')]);
    expect(res).toEqual([
      { year: 2025, avgScore: 9, count: 1 },
      { year: 2026, avgScore: 6, count: 1 },
    ]);
  });
});

describe('statusMix and dropRates', () => {
  const list = [
    statTitle({ category: 'tv', status: 'COMPLETED' }),
    statTitle({ category: 'tv', status: 'DROPPED' }),
    statTitle({ category: 'tv', status: 'RETIRED' }),
    statTitle({ category: 'tv', status: 'PLANNED' }),
    statTitle({ category: 'books', status: 'PLANNED' }),
  ];

  it('splits each section by status', () => {
    const mix = statusMix(list);
    expect(mix.map((r) => r.slug)).toEqual(['books', 'tv']);
    expect(mix[1]).toMatchObject({ total: 4, counts: { COMPLETED: 1, DROPPED: 1, RETIRED: 1, PLANNED: 1, CONSUMING: 0, ON_HOLD: 0 } });
  });

  it('drop rate = dropped ÷ ended; null with nothing ended', () => {
    const rates = dropRates(list);
    expect(rates[0]).toEqual({ slug: 'books', dropped: 0, ended: 0, rate: null });
    expect(rates[1].rate).toBeCloseTo(1 / 3);
  });
});

describe('crowdOverview', () => {
  it('biggest differences across sections and the mean per section', () => {
    const list = [
      statTitle({ category: 'movies', rating: 9, media: { title: 'A', crowd: 6 } }),
      statTitle({ category: 'anime', rating: 5, media: { title: 'B', crowd: 8.5 } }),
      statTitle({ category: 'movies', rating: 7, media: { title: 'C', crowd: 7 } }),
      statTitle({ category: 'books', rating: 7, media: { title: 'D', crowd: null } }),
      statTitle({ category: 'games', rating: null, media: { title: 'E', crowd: 9 } }),
    ];
    const res = crowdOverview(list, 2);
    expect(res.top.map((r) => [r.title, r.diff])).toEqual([
      ['B', -3.5],
      ['A', 3],
    ]);
    expect(res.count).toBe(3);
    expect(res.sections).toEqual([
      { slug: 'movies', count: 2, meanDiff: 1.5 },
      { slug: 'anime', count: 1, meanDiff: -3.5 },
    ]);
  });
});
