import { describe, expect, it } from 'vitest';

import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import { entry, statTitle } from './fixtures';
import { busiestMonth, topFranchise, yearPromptLines, yearSummary } from './year';

const labels = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])) as Record<CategorySlug, string>;

describe('yearSummary', () => {
  const movie = statTitle({ category: 'movies', rating: 9, tier: 'S', media: { runtime: 120, title: 'Arrival' } });
  const show = statTitle({ category: 'tv', rating: 7, media: { episodeCount: 10, episodeRunTime: 30 } });
  const book = statTitle({ category: 'books', rating: 8, tier: 'S', media: { pageCount: 300, title: 'Dune' } });
  const lastYear = statTitle({ category: 'movies', tier: 'S', media: { runtime: 100 } });
  const dropped = statTitle({ category: 'anime', status: 'DROPPED', media: { episodes: 24 } });
  const game = statTitle({ category: 'games' });
  const titles = [movie, show, book, lastYear, dropped, game];
  const entries = [
    entry(movie, '2026-03-02'),
    entry(movie, '2026-11-20'), // a rewatch
    entry(show, '2026-03-15'),
    entry(book, '2026-07-01'),
    entry(lastYear, '2025-12-31'),
    entry(dropped, '2026-03-20'),
    entry(game, '2026-01-05'),
  ];
  const s = yearSummary(titles, entries, 2026);

  it('counts each finished title once and every finish', () => {
    expect(s.finished).toBe(4);
    expect(s.finishes).toBe(5);
  });

  it('lists sections in navigation order', () => {
    expect(s.sections.map((x) => x.slug)).toEqual(['books', 'movies', 'games', 'tv']);
    expect(s.sections.find((x) => x.slug === 'movies')).toMatchObject({ finished: 1, finishes: 2, avgScore: 9 });
  });

  it('adds up hours, pages and episodes', () => {
    expect(s.hours).toBe(7); // 120 min + 10 × 30 min
    expect(s.pages).toBe(300);
    expect(s.episodes).toBe(10);
    expect(s.games).toBe(1);
  });

  it('new S-tier = finished this year and in S now, best score first', () => {
    expect(s.sTier.map((t) => t.media.title)).toEqual(['Arrival', 'Dune']);
  });

  it('finds the busiest month (a rewatch counts)', () => {
    expect(s.busiestMonth).toEqual({ month: 3, finishes: 2 });
  });

  it('is empty for a year without finishes', () => {
    const empty = yearSummary(titles, entries, 2019);
    expect(empty).toMatchObject({ finished: 0, hours: 0, sections: [], sTier: [], topFranchise: null, busiestMonth: null, avgScore: null });
  });

  it('builds prompt lines from the summary only', () => {
    const lines = yearPromptLines(s, labels, ['Arrival']).join('\n');
    expect(lines).toContain('Year: 2026');
    expect(lines).toContain('Titles finished: 4 (5 finishes counting repeats)');
    expect(lines).toContain('Busiest month: March (2)');
    expect(lines).toContain('Their top 3 of the year: Arrival');
  });
});

describe('topFranchise', () => {
  const f = (id: string, name: string) => ({ id, name });
  it('most titles wins', () => {
    const list = [
      statTitle({ franchise: f('a', 'Alien') }),
      statTitle({ franchise: f('a', 'Alien') }),
      statTitle({ franchise: f('b', 'Dune'), rating: 10 }),
    ];
    expect(topFranchise(list)).toEqual({ name: 'Alien', count: 2, avgScore: null });
  });

  it('ties go to the higher average score, then the name', () => {
    const list = [
      statTitle({ franchise: f('a', 'Alien'), rating: 6 }),
      statTitle({ franchise: f('b', 'Dune'), rating: 9 }),
      statTitle({ franchise: f('c', 'Blade Runner') }),
    ];
    expect(topFranchise(list)?.name).toBe('Dune');
    expect(topFranchise([statTitle({ franchise: f('x', 'Zeta') }), statTitle({ franchise: f('y', 'Beta') })])?.name).toBe('Beta');
  });

  it('is null without franchises', () => {
    expect(topFranchise([statTitle()])).toBeNull();
  });
});

describe('busiestMonth', () => {
  it('ties go to the earlier month', () => {
    const t = statTitle();
    expect(busiestMonth([entry(t, '2026-05-01'), entry(t, '2026-02-01')])).toEqual({ month: 2, finishes: 1 });
  });
});
