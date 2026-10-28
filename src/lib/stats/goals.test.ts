import { describe, expect, it } from 'vitest';

import { entry, statTitle } from './fixtures';
import { goalsProgress, goalUnit, goalValue, metricFits, parseGoalInput, parseGoalTarget } from './goals';

describe('parseGoalInput', () => {
  it('accepts a valid goal and maps "all" to null', () => {
    expect(parseGoalInput({ year: 2026, category: 'all', metric: 'count', target: 50 })).toEqual({
      ok: true,
      goal: { year: 2026, category: null, metric: 'count', target: 50 },
    });
    expect(parseGoalInput({ year: 2026, category: 'books', metric: 'pages', target: '5000' })).toMatchObject({ ok: true });
  });

  it('rejects bad years, sections, metrics and targets', () => {
    expect(parseGoalInput({ year: 1800, category: null, metric: 'count', target: 1 }).ok).toBe(false);
    expect(parseGoalInput({ year: 2026, category: 'toString', metric: 'count', target: 1 }).ok).toBe(false);
    expect(parseGoalInput({ year: 2026, category: null, metric: 'words', target: 1 }).ok).toBe(false);
    expect(parseGoalInput({ year: 2026, category: null, metric: 'count', target: 0 }).ok).toBe(false);
    expect(parseGoalInput({ year: 2026, category: null, metric: 'count', target: 100_001 }).ok).toBe(false);
    expect(parseGoalInput(null).ok).toBe(false);
  });

  it('rejects metrics that cannot be measured for the section', () => {
    expect(parseGoalInput({ year: 2026, category: 'games', metric: 'hours', target: 10 })).toMatchObject({ ok: false });
    expect(parseGoalInput({ year: 2026, category: 'movies', metric: 'pages', target: 10 }).ok).toBe(false);
    expect(metricFits('episodes', 'anime')).toBe(true);
    expect(metricFits('episodes', null)).toBe(true);
  });
});

describe('parseGoalTarget', () => {
  it('whole numbers 1…100000 only', () => {
    expect(parseGoalTarget(' 12 ')).toBe(12);
    expect(parseGoalTarget(1.5)).toBeNull();
    expect(parseGoalTarget(100_000)).toBe(100_000);
    expect(parseGoalTarget('-3')).toBeNull();
  });
});

describe('goalValue', () => {
  const book = statTitle({ category: 'books', media: { pageCount: 300 } });
  const book2 = statTitle({ category: 'books', media: { pageCount: 200 } });
  const movie = statTitle({ category: 'movies', media: { runtime: 150 } });
  const show = statTitle({ category: 'tv', media: { episodeCount: 8, episodeRunTime: 60 } });
  const anime = statTitle({ category: 'anime', media: { episodes: 12 } });
  const game = statTitle({ category: 'games' });
  const droppedGame = statTitle({ category: 'games', status: 'DROPPED' });
  const titles = [book, book2, movie, show, anime, game, droppedGame];
  const entries = [
    entry(book, '2026-01-10'),
    entry(book, '2026-08-10'), // re-read: still one book
    entry(book2, '2025-12-31'), // last year
    entry(movie, '2026-02-01'),
    entry(show, '2026-03-01'),
    entry(anime, '2026-04-01'),
    entry(game, '2026-05-01'),
    entry(droppedGame, '2026-05-02'),
  ];
  const v = (category: Parameters<typeof goalValue>[0]['category'], metric: Parameters<typeof goalValue>[0]['metric']) =>
    goalValue({ year: 2026, category, metric }, titles, entries);

  it('count: all sections or one; games beaten excludes drops', () => {
    expect(v(null, 'count')).toBe(5);
    expect(v('books', 'count')).toBe(1);
    expect(v('games', 'count')).toBe(1);
  });

  it('pages from books', () => {
    expect(v(null, 'pages')).toBe(300);
    expect(v('books', 'pages')).toBe(300);
  });

  it('hours from movies, TV and anime (rounded down)', () => {
    // 150 + 8 × 60 + 12 × 24 = 918 min = 15.3 h
    expect(v(null, 'hours')).toBe(15);
    expect(v('movies', 'hours')).toBe(2);
  });

  it('episodes from TV and anime', () => {
    expect(v(null, 'episodes')).toBe(20);
    expect(v('anime', 'episodes')).toBe(12);
  });

  it('progress caps the share at 1 and sorts all-sections first', () => {
    const rows = goalsProgress(
      [
        { id: 'g2', year: 2026, category: 'books', metric: 'count', target: 1 },
        { id: 'g1', year: 2026, category: null, metric: 'count', target: 10 },
      ],
      titles,
      entries,
    );
    expect(rows.map((r) => r.id)).toEqual(['g1', 'g2']);
    expect(rows[0]).toMatchObject({ value: 5, share: 0.5, done: false });
    expect(rows[1]).toMatchObject({ value: 1, share: 1, done: true });
  });
});

describe('goalUnit', () => {
  it('reads naturally', () => {
    expect(goalUnit('count', 'games', 2)).toBe('games beaten');
    expect(goalUnit('count', null, 1)).toBe('title finished');
    expect(goalUnit('pages', null, 2)).toBe('pages read');
  });
});
