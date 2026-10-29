import { describe, expect, it } from 'vitest';

import { crowdScore } from './crowd';

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
