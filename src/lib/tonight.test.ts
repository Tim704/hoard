import { describe, expect, it } from 'vitest';

import type { CategorySlug } from './categories';
import {
  estimateMinutes,
  fitsTime,
  formatMinutes,
  genreOptions,
  pickTonight,
  tonightPool,
  type TonightCandidate,
} from './tonight';

describe('estimateMinutes', () => {
  it('uses each medium’s rule', () => {
    expect(estimateMinutes('movies', { runtime: 112 })).toEqual({ minutes: 112, singleSitting: true, sessions: false });
    expect(estimateMinutes('movies', {}).minutes).toBeNull();
    expect(estimateMinutes('tv', {}).minutes).toBe(45);
    expect(estimateMinutes('tv', { episodeRunTime: 22 }).minutes).toBe(22);
    expect(estimateMinutes('anime', { episodes: 12 })).toEqual({ minutes: 24, singleSitting: true, sessions: true });
    expect(estimateMinutes('games', { timeToBeatHours: 32.5 })).toEqual({
      minutes: 1950,
      singleSitting: false,
      sessions: true,
    });
    expect(estimateMinutes('books', { pageCount: 240 }).minutes).toBe(360); // 240 ÷ 40 = 6 h
    expect(estimateMinutes('books', { pageCount: 20 }).minutes).toBe(30);
    expect(estimateMinutes('music', {}).minutes).toBe(45);
    expect(estimateMinutes('manga', { chapters: 100 })).toEqual({ minutes: null, singleSitting: false, sessions: true });
  });
});

describe('fitsTime', () => {
  const film = (runtime?: number) => estimateMinutes('movies', { runtime });
  it('bounds single sittings by the chosen time', () => {
    expect(fitsTime(film(30), '30m')).toBe(true);
    expect(fitsTime(film(31), '30m')).toBe(false);
    expect(fitsTime(film(118), '2h')).toBe(true);
    expect(fitsTime(film(190), '2h')).toBe(false);
    expect(fitsTime(film(190), '3h')).toBe(true);
    expect(fitsTime(film(), '1h')).toBe(false); // unknown length only for 3 h+
    expect(fitsTime(film(), '3h')).toBe(true);
    expect(fitsTime(estimateMinutes('music', {}), '1h')).toBe(true);
  });

  it('keeps games out of single evenings and puts multi-session kinds under "a few sessions"', () => {
    const game = estimateMinutes('games', { timeToBeatHours: 0.4 });
    expect(fitsTime(game, '1h')).toBe(false);
    expect(fitsTime(game, 'sessions')).toBe(true);
    expect(fitsTime(estimateMinutes('books', { pageCount: 300 }), 'sessions')).toBe(true);
    expect(fitsTime(estimateMinutes('tv', {}), 'sessions')).toBe(true); // the whole series
    expect(fitsTime(film(90), 'sessions')).toBe(false);
    expect(fitsTime(estimateMinutes('music', {}), 'sessions')).toBe(false);
  });
});

const c = (id: string, slug: CategorySlug, media: Record<string, unknown> = {}, genres: string[] = []): TonightCandidate => ({
  id,
  slug,
  genres,
  estimate: estimateMinutes(slug, media),
});

describe('pickTonight', () => {
  const queues = {
    movies: [
      c('m1', 'movies', { runtime: 170 }, ['Drama']),
      c('m2', 'movies', { runtime: 95 }, ['Comedy']),
      c('m3', 'movies', { runtime: 100 }, ['Horror']),
      c('m4', 'movies', { runtime: 88 }, ['Comedy']),
    ],
    anime: [c('a1', 'anime', {}, ['Action']), c('a2', 'anime', {}, ['Comedy'])],
    games: [c('g1', 'games', { timeToBeatHours: 20 })],
  };

  it('interleaves sections, each from the top of its queue, skipping what does not fit', () => {
    const f = { time: '2h' as const, sections: ['movies', 'anime', 'games'] as CategorySlug[], genres: [] };
    expect(tonightPool(queues, f).map((x) => x.id)).toEqual(['m2', 'a1', 'm3', 'a2', 'm4']);
    expect(pickTonight(queues, f).map((x) => x.id)).toEqual(['m2', 'a1', 'm3']);
  });

  it('"Another" moves on to the next fitting titles, then wraps', () => {
    const f = { time: '2h' as const, sections: ['movies', 'anime'] as CategorySlug[], genres: [] };
    expect(pickTonight(queues, f, 1).map((x) => x.id)).toEqual(['a2', 'm4', 'm2']);
    expect(pickTonight(queues, f, 2).map((x) => x.id)).toEqual(['a1', 'm3', 'a2']);
    expect(pickTonight(queues, f, 1)).toEqual(pickTonight(queues, f, 1)); // deterministic
  });

  it('filters by section, genre (any, case-insensitive) and services', () => {
    expect(
      pickTonight(queues, { time: '3h', sections: ['movies'], genres: ['comedy'] }).map((x) => x.id),
    ).toEqual(['m2', 'm4']);
    expect(pickTonight(queues, { time: 'sessions', sections: ['games', 'movies'], genres: [] }).map((x) => x.id)).toEqual([
      'g1',
    ]);
    expect(
      pickTonight(queues, {
        time: '3h',
        sections: ['movies', 'anime'],
        genres: [],
        onServices: (id) => id === 'm3' || id === 'a2',
      }).map((x) => x.id),
    ).toEqual(['m3', 'a2']);
    expect(pickTonight(queues, { time: '3h', sections: [], genres: [] })).toEqual([]);
  });
});

describe('genreOptions / formatMinutes', () => {
  it('lists each genre once, alphabetically', () => {
    expect(genreOptions([{ genres: ['Drama', 'comedy'] }, { genres: ['Comedy', 'Action'] }])).toEqual([
      'Action',
      'comedy',
      'Drama',
    ]);
  });
  it('formats lengths', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(130)).toBe('2 h 10 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(1950)).toBe('≈ 33 h');
    expect(formatMinutes(null)).toBeNull();
  });
});
