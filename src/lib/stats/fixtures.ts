// Test helpers for the stats modules (imported by *.test.ts only).

import type { FinishEntry, StatMedia, StatTitle } from './types';

let n = 0;

/** A StatTitle with sensible empty defaults; override what the test needs. */
export function statTitle(
  over: Partial<Omit<StatTitle, 'media'>> & { media?: Partial<StatMedia> } = {},
): StatTitle {
  n += 1;
  const { media, ...rest } = over;
  return {
    id: `t${n}`,
    category: 'movies',
    status: 'COMPLETED',
    rating: null,
    tier: null,
    progress: null,
    rewatching: false,
    franchise: null,
    ...rest,
    media: {
      title: `Title ${n}`,
      imageUrl: null,
      genres: [],
      runtime: null,
      episodeCount: null,
      episodeRunTime: null,
      episodes: null,
      pageCount: null,
      chapters: null,
      trackCount: null,
      directors: [],
      cast: [],
      crowd: null,
      ...media,
    },
  };
}

export const entry = (t: StatTitle, date: string, rating: number | null = null): FinishEntry => ({
  activityId: t.id,
  date,
  rating,
});
