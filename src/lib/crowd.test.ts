import { describe, expect, it } from 'vitest';

import { biggestDisagreements, crowdScore, crowdSummary } from './crowd';
import { makeActivity } from './test-fixtures';

const item = (id: string, category: Parameters<typeof makeActivity>[0]['category'], rating: number | null, extra: Record<string, unknown>) => {
  const a = makeActivity({ id, category, rating });
  return { ...a, media: { ...a.media, ...extra } };
};

describe('crowdScore', () => {
  it('reads TMDB and MAL as 0–10 and IGDB divided by 10', () => {
    expect(crowdScore({ tmdbRating: 7.8 }, 'movies')).toBe(7.8);
    expect(crowdScore({ tmdbRating: 8.25 }, 'tv')).toBe(8.3);
    expect(crowdScore({ malScore: 9.1 }, 'anime')).toBe(9.1);
    expect(crowdScore({ malScore: 8.7 }, 'manga')).toBe(8.7);
    expect(crowdScore({ igdbRating: 87 }, 'games')).toBe(8.7);
  });

  it('has no crowd for books and music, or for missing / zero / junk values', () => {
    expect(crowdScore({ tmdbRating: 8 }, 'books')).toBeNull();
    expect(crowdScore({ igdbRating: 80 }, 'music')).toBeNull();
    expect(crowdScore({}, 'movies')).toBeNull();
    expect(crowdScore({ tmdbRating: 0 }, 'movies')).toBeNull();
    expect(crowdScore({ tmdbRating: '8' }, 'movies')).toBeNull();
    expect(crowdScore({ igdbRating: Number.NaN }, 'games')).toBeNull();
  });

  it('reads only the field for its own medium', () => {
    expect(crowdScore({ malScore: 8 }, 'movies')).toBeNull();
  });
});

describe('biggestDisagreements', () => {
  const list = [
    item('agree', 'movies', 8, { tmdbRating: 8 }),
    item('hate', 'movies', 3, { tmdbRating: 8.5 }),
    item('love', 'games', 9, { igdbRating: 60 }),
    item('unscored', 'movies', null, { tmdbRating: 2 }),
    item('book', 'books', 1, {}),
    item('nocrowd', 'movies', 1, { tmdbRating: null }),
  ];

  it('ranks by the absolute gap, skipping unscored and crowdless titles', () => {
    const top = biggestDisagreements(list, 10);
    expect(top.map((d) => d.activity.id)).toEqual(['hate', 'love', 'agree']);
    expect(top[0]).toMatchObject({ yours: 3, crowd: 8.5, diff: -5.5 });
    expect(top[1]).toMatchObject({ crowd: 6, diff: 3 });
  });

  it('keeps only n', () => {
    expect(biggestDisagreements(list, 1).map((d) => d.activity.id)).toEqual(['hate']);
    expect(biggestDisagreements(list, 0)).toEqual([]);
  });

  it('summarises the mean difference and gap', () => {
    expect(crowdSummary(list)).toEqual({ count: 3, meanDiff: -0.8, meanGap: 2.8 });
    expect(crowdSummary([])).toEqual({ count: 0, meanDiff: null, meanGap: null });
  });
});
