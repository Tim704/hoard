import { describe, expect, it } from 'vitest';

import topRated from './__fixtures__/tmdb-top-rated.json';
import { aniListTopQuery } from './anilist';
import { IGDB_TOP_GAMES_QUERY } from './igdb';
import { mapTmdbTopRated } from './tmdb';

describe('reference list provider shapes', () => {
  it('maps a TMDB top rated page in order and skips malformed rows', () => {
    const hits = mapTmdbTopRated('movie', topRated);
    expect(hits.map((h) => [h.externalId, h.title, h.year])).toEqual([
      ['238', 'The Godfather', 1972],
      ['278', 'The Shawshank Redemption', null],
    ]);
    expect(hits[0].imageUrl).toBe('https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg');
    expect(hits[1].imageUrl).toBeNull();
  });
  it('tolerates a page without results', () => {
    expect(mapTmdbTopRated('tv', { page: 1 })).toEqual([]);
    expect(mapTmdbTopRated('tv', null)).toEqual([]);
  });
  it('asks AniList for score-sorted pages of 50', () => {
    const q = aniListTopQuery('MANGA');
    expect(q).toContain('perPage: 50');
    expect(q).toContain('type: MANGA, sort: SCORE_DESC, isAdult: false');
    expect(q).toContain('$page');
  });
  it('asks IGDB for the 100 best rated games with over 500 ratings', () => {
    expect(IGDB_TOP_GAMES_QUERY).toContain('where rating_count > 500;');
    expect(IGDB_TOP_GAMES_QUERY).toContain('sort rating desc;');
    expect(IGDB_TOP_GAMES_QUERY).toContain('limit 100;');
  });
});
