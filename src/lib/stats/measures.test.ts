import { describe, expect, it } from 'vitest';

import { entry, statTitle } from './fixtures';
import {
  averageScore,
  chaptersOf,
  episodesOf,
  finishedIn,
  hoursOf,
  minutesOf,
  pagesOf,
  sectionStat,
  WORDS_PER_PAGE,
} from './measures';

describe('minutesOf / hoursOf (the documented approximation)', () => {
  it('movies use the runtime', () => {
    expect(minutesOf(statTitle({ category: 'movies', media: { runtime: 150 } }))).toBe(150);
    expect(hoursOf(statTitle({ category: 'movies', media: { runtime: 90 } }))).toBe(1.5);
  });

  it('TV uses episodes × the episode length, or 45 minutes', () => {
    expect(minutesOf(statTitle({ category: 'tv', media: { episodeCount: 10, episodeRunTime: 30 } }))).toBe(300);
    expect(minutesOf(statTitle({ category: 'tv', media: { episodeCount: 10 } }))).toBe(450);
  });

  it('anime uses 24 minutes an episode', () => {
    expect(minutesOf(statTitle({ category: 'anime', media: { episodes: 12 } }))).toBe(288);
  });

  it('other sections add no hours, and unknowns count as zero', () => {
    expect(minutesOf(statTitle({ category: 'books', media: { pageCount: 300 } }))).toBe(0);
    expect(minutesOf(statTitle({ category: 'movies' }))).toBe(0);
  });

  it('a retired title only counts the progress it reached', () => {
    const show = statTitle({ category: 'tv', status: 'RETIRED', progress: 4, media: { episodeCount: 20, episodeRunTime: 50 } });
    expect(episodesOf(show)).toBe(4);
    expect(minutesOf(show)).toBe(200);
    expect(pagesOf(statTitle({ category: 'books', status: 'RETIRED', progress: 900, media: { pageCount: 300 } }))).toBe(300);
    expect(chaptersOf(statTitle({ category: 'manga', status: 'RETIRED', media: { chapters: 100 } }))).toBe(0);
    expect(minutesOf(statTitle({ category: 'movies', status: 'RETIRED', media: { runtime: 120 } }))).toBe(0);
  });

  it('a finished show or anime without a known episode count falls back to its progress', () => {
    const show = statTitle({ category: 'tv', progress: 6, media: { episodeRunTime: 30 } });
    expect(episodesOf(show)).toBe(6);
    expect(minutesOf(show)).toBe(180);
    expect(episodesOf(statTitle({ category: 'anime', progress: 10 }))).toBe(10);
    expect(minutesOf(statTitle({ category: 'anime', progress: 10 }))).toBe(240);
    expect(episodesOf(statTitle({ category: 'anime' }))).toBe(0);
    // A known count wins over progress.
    expect(episodesOf(statTitle({ category: 'tv', progress: 3, media: { episodeCount: 10 } }))).toBe(10);
  });

  it('a retired title being rewatched counts in full', () => {
    expect(episodesOf(statTitle({ category: 'anime', status: 'RETIRED', rewatching: true, progress: 2, media: { episodes: 12 } }))).toBe(12);
  });
});

describe('finishedIn', () => {
  it('keeps titles finished in the range once, with every entry', () => {
    const a = statTitle();
    const b = statTitle({ status: 'DROPPED' });
    const c = statTitle({ status: 'CONSUMING', rewatching: true });
    const d = statTitle({ status: 'RETIRED' });
    const res = finishedIn(
      [a, b, c, d],
      [entry(a, '2026-01-01'), entry(a, '2026-06-01'), entry(b, '2026-02-01'), entry(c, '2026-03-01'), entry(d, '2025-12-31')],
      { from: '2026-01-01', to: '2026-12-31' },
    );
    expect(res.titles.map((t) => t.id)).toEqual([a.id, c.id]);
    expect(res.entries).toHaveLength(3);
  });

  it('ignores entries of titles that are not in the list', () => {
    expect(finishedIn([], [{ activityId: 'x', date: '2026-01-01', rating: null }], { from: '2026-01-01', to: '2026-12-31' }).titles).toEqual([]);
  });
});

describe('averageScore', () => {
  it('averages the rated titles to one decimal', () => {
    expect(averageScore([{ rating: 8 }, { rating: 7.5 }, { rating: null }])).toBe(7.8);
    expect(averageScore([{ rating: null }])).toBeNull();
  });
});

describe('sectionStat (shared with the dashboard)', () => {
  it('counts statuses and sums the completed rows only', () => {
    const rows = [
      { status: 'COMPLETED' as const, rating: 8, media: { pageCount: 100 } },
      { status: 'COMPLETED' as const, rating: null, media: { pageCount: null } },
      { status: 'DROPPED' as const, rating: 3, media: { pageCount: 500 } },
      { status: 'PLANNED' as const, rating: null, media: {} },
    ];
    const s = sectionStat('books', rows);
    expect(s).toMatchObject({ total: 4, completed: 2, dropped: 1, planned: 1, avgRating: 5.5, metricUnit: 'words' });
    expect(s.metricValue).toBe(100 * WORDS_PER_PAGE);
  });

  it('movies report hours, games the number beaten', () => {
    expect(sectionStat('movies', [{ status: 'COMPLETED', rating: null, media: { runtime: 150 } }]).metricValue).toBe(3);
    expect(sectionStat('games', [{ status: 'COMPLETED', rating: null, media: {} }]).metricValue).toBe(1);
    expect(sectionStat('tv', []).metricValue).toBe(0);
  });
});
