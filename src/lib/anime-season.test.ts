import { describe, expect, it } from 'vitest';

import { currentSeason, parseSeasonQuery, seasonForMonth, seasonGraphql, seasonVariables } from '@/lib/anime-season';

describe('anime seasons', () => {
  it('maps months to AniList seasons', () => {
    expect([1, 2, 3].map(seasonForMonth)).toEqual(['WINTER', 'WINTER', 'WINTER']);
    expect([4, 5, 6].map(seasonForMonth)).toEqual(['SPRING', 'SPRING', 'SPRING']);
    expect([7, 8, 9].map(seasonForMonth)).toEqual(['SUMMER', 'SUMMER', 'SUMMER']);
    expect([10, 11, 12].map(seasonForMonth)).toEqual(['FALL', 'FALL', 'FALL']);
    expect(currentSeason('2026-10-28')).toEqual({ season: 'FALL', year: 2026 });
    expect(currentSeason('2027-01-01')).toEqual({ season: 'WINTER', year: 2027 });
  });
  it('validates queries strictly', () => {
    expect(parseSeasonQuery({ season: 'FALL', year: 2026, genre: null, format: null, page: 1 }, 2028)).toEqual({
      season: 'FALL', year: 2026, genre: null, format: null, page: 1,
    });
    expect(parseSeasonQuery({ season: 'FALL', year: 2026, genre: 'Sci-Fi', format: 'MOVIE', page: 2 }, 2028)).toMatchObject({ genre: 'Sci-Fi', format: 'MOVIE' });
    expect(parseSeasonQuery({ season: 'AUTUMN', year: 2026, page: 1 }, 2028)).toBeNull();
    expect(parseSeasonQuery({ season: 'FALL', year: 2031, page: 1 }, 2028)).toBeNull();
    expect(parseSeasonQuery({ season: 'FALL', year: 2026, genre: 'Hentai', page: 1 }, 2028)).toBeNull();
    expect(parseSeasonQuery({ season: 'FALL', year: 2026, format: 'MUSIC', page: 1 }, 2028)).toBeNull();
    expect(parseSeasonQuery({ season: 'FALL', year: 2026, page: 0 }, 2028)).toBeNull();
  });
  it('builds the AniList query, leaving unset filters out', () => {
    const q = seasonGraphql('id');
    expect(q).toContain('media(season: $season, seasonYear: $year, type: ANIME');
    expect(q).toContain('sort: POPULARITY_DESC');
    expect(q).toContain('perPage: 50');
    expect(seasonVariables({ season: 'FALL', year: 2026, genre: null, format: null, page: 1 })).toEqual({ season: 'FALL', year: 2026, page: 1 });
  });
});
