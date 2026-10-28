// Provider response → column mappers, on fixture JSON shaped like each
// provider's documented responses. No network.

import { describe, expect, it } from 'vitest';

import anilistAnime from './__fixtures__/anilist-anime.json';
import igdbDetails from './__fixtures__/igdb-game-details.json';
import igdbSearch from './__fixtures__/igdb-games-search.json';
import igdbTtb from './__fixtures__/igdb-time-to-beat.json';
import lastfmError from './__fixtures__/lastfm-album-error.json';
import lastfmInfo from './__fixtures__/lastfm-album-getinfo.json';
import lastfmSingle from './__fixtures__/lastfm-album-single-tag.json';
import olSearch from './__fixtures__/openlibrary-search.json';
import olWork from './__fixtures__/openlibrary-work.json';
import tmdbMovieDetails from './__fixtures__/tmdb-movie-details.json';
import tmdbMovieSearch from './__fixtures__/tmdb-movie-search.json';
import tmdbTvDetails from './__fixtures__/tmdb-tv-details.json';
import tmdbTvReturning from './__fixtures__/tmdb-tv-returning.json';
import { aniListPatch, mapAnime, mapManga, type AniListMedia } from './anilist';
import { mapBookDoc, mapWork } from './books';
import { mapGameDetails, mapGameSearchHit, steamAppIdFrom, timeToBeatHours } from './igdb';
import { mapAlbumInfo } from './music';
import { genreNamesFromIds, mapMovieDetails, mapMovieSearchHit, mapTvDetails } from './tmdb';

describe('TMDB', () => {
  it('maps a movie search hit with its date and genre ids', () => {
    const r = mapMovieSearchHit(tmdbMovieSearch.results[0]);
    expect(r.year).toBe(1999);
    expect(r.fields).toMatchObject({
      externalId: '603',
      title: 'The Matrix',
      releaseDate: '1999-03-30',
      genres: ['Action', 'Science Fiction'],
    });
  });

  it('leaves the F2 columns out of a hit without them (re-adding never blanks them)', () => {
    const r = mapMovieSearchHit(tmdbMovieSearch.results[1]);
    expect(r.year).toBeNull();
    expect(r.fields).not.toHaveProperty('releaseDate');
    expect(r.fields).not.toHaveProperty('genres');
  });

  it('maps movie details with directors and the top 5 billed cast', () => {
    const d = mapMovieDetails(tmdbMovieDetails);
    expect(d).toEqual({
      title: 'The Matrix',
      imageUrl: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w780/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg',
      description: 'Set in the 22nd century, The Matrix tells the story of a computer hacker…',
      tmdbRating: 8.2,
      runtime: 136,
      collection: { id: 2344, name: 'The Matrix Collection' },
      releaseDate: '1999-03-30',
      year: 1999,
      genres: ['Action', 'Science Fiction'],
      directors: ['Lilly Wachowski', 'Lana Wachowski'],
      cast: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss', 'Hugo Weaving', 'Gloria Foster'],
    });
  });

  it('maps tv details: creators as directors, status, no next episode', () => {
    const d = mapTvDetails(tmdbTvDetails);
    expect(d).toEqual({
      title: 'Game of Thrones',
      imageUrl: 'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',
      description: 'Seven noble families fight for control of the mythical land of Westeros.',
      tmdbRating: 8.5,
      episodeCount: 73,
      seasonCount: 8,
      releaseDate: '2011-04-17',
      year: 2011,
      genres: ['Sci-Fi & Fantasy', 'Drama', 'Action & Adventure'],
      directors: ['David Benioff', 'D.B. Weiss'],
      cast: ['Peter Dinklage', 'Emilia Clarke', 'Kit Harington'],
      status: 'Ended',
      nextAirDate: null,
      episodeRunTime: 60,
    });
  });

  it('uses the same poster URL format as search hits, and no votes is no rating', () => {
    const hit = mapMovieSearchHit({ id: 1, title: 'X', poster_path: '/p.jpg', vote_average: 0 });
    const d = mapMovieDetails({ poster_path: '/p.jpg', vote_average: 0, title: '  ' });
    expect(d.imageUrl).toBe(hit.imageUrl);
    expect(d.tmdbRating).toBeNull();
    expect(d.title).toBeNull();
  });

  it('maps a returning show: next air date, and a partial date keeps only the year', () => {
    const d = mapTvDetails(tmdbTvReturning);
    expect(d.status).toBe('Returning Series');
    expect(d.nextAirDate).toBe('2026-11-04');
    expect(d.releaseDate).toBeNull();
    expect(d.year).toBe(2022);
    expect(d.cast).toEqual([]);
  });

  it('maps genre ids per list and skips unknown ones', () => {
    expect(genreNamesFromIds([10765, 18, 424242], 'tv')).toEqual(['Sci-Fi & Fantasy', 'Drama']);
    expect(genreNamesFromIds([878], 'movie')).toEqual(['Science Fiction']);
    expect(genreNamesFromIds(null, 'movie')).toEqual([]);
  });
});

describe('AniList', () => {
  const [frieren, upcoming] = anilistAnime.data.Page.media as AniListMedia[];

  it('stores all three title variants and the full start date', () => {
    const r = mapAnime(frieren);
    expect(r.externalId).toBe('52991');
    expect(r.title).toBe('Frieren: Beyond Journey’s End');
    expect(r.fields).toMatchObject({
      titleEnglish: 'Frieren: Beyond Journey’s End',
      titleRomaji: 'Sousou no Frieren',
      titleNative: '葬送のフリーレン',
      releaseDate: '2023-09-29',
      genres: ['Adventure', 'Drama', 'Fantasy'],
      nextAiringAt: null,
      nextAiringEpisode: null,
      studio: 'MADHOUSE',
    });
  });

  it('keeps only the year for a partial date and records the next airing', () => {
    const r = mapAnime(upcoming);
    expect(r.externalId).toBe('al-200001');
    expect(r.title).toBe('Mada Mikan no Anime');
    expect(r.year).toBe(2027);
    expect(r.fields).not.toHaveProperty('releaseDate');
    expect(r.fields).not.toHaveProperty('genres');
    expect(r.fields).toMatchObject({
      titleEnglish: null,
      titleNative: 'まだ未完のアニメ',
      nextAiringAt: '2027-01-01T00:00:00.000Z',
      nextAiringEpisode: 1,
    });
  });

  it('maps manga without airing fields', () => {
    const r = mapManga({ ...frieren, chapters: 140, volumes: 14 });
    expect(r.fields).toMatchObject({ chapters: 140, volumes: 14, titleRomaji: 'Sousou no Frieren' });
    expect(r.fields).not.toHaveProperty('nextAiringAt');
  });

  it('builds the lookup patch with fresh counts and the display core, as search maps it', () => {
    const hit = mapAnime(frieren);
    expect(aniListPatch(frieren, 'ANIME')).toMatchObject({
      titleRomaji: 'Sousou no Frieren',
      year: 2023,
      episodes: 28,
      releaseDate: '2023-09-29',
      title: hit.title,
      imageUrl: hit.imageUrl,
      description: hit.description,
      malScore: 9,
      studio: 'MADHOUSE',
    });
    expect(hit.description).toBe(
      'The adventure is over but life goes on for an elf mage just beginning to learn what living is all about.',
    );
  });

  it('leaves the display core out when AniList has none (never blanks stored values)', () => {
    const p = aniListPatch(upcoming, 'ANIME');
    expect(p.title).toBe('Mada Mikan no Anime'); // romaji when there is no English title
    for (const k of ['imageUrl', 'description', 'malScore', 'studio']) expect(p).not.toHaveProperty(k);
    expect(aniListPatch({ id: 1, title: null }, 'MANGA')).not.toHaveProperty('title');
  });
});

describe('IGDB', () => {
  it('maps a search hit with the release day and genre names', () => {
    const r = mapGameSearchHit(igdbSearch[0]);
    expect(r.year).toBe(2022);
    expect(r.fields).toMatchObject({
      externalId: '119133',
      releaseDate: '2022-02-25',
      genres: ['Role-playing (RPG)', 'Adventure'],
      igdbRating: 95,
    });
  });

  it('maps details: Steam app id from external games and time to beat in hours', () => {
    expect(mapGameDetails(igdbDetails[0], igdbTtb[0])).toEqual({
      title: 'Elden Ring',
      imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg',
      description: 'Rise, Tarnished.',
      igdbRating: 95,
      releaseDate: '2022-02-25',
      year: 2022,
      genres: ['Role-playing (RPG)', 'Adventure'],
      steamAppId: 1245620,
      timeToBeatHours: 60,
    });
  });

  it('finds Steam by source name, legacy source id, or store URL', () => {
    expect(steamAppIdFrom([{ uid: '570', external_game_source: { id: 1 } }])).toBe(570);
    expect(steamAppIdFrom([{ uid: '570', external_game_source: 1 }])).toBe(570);
    expect(steamAppIdFrom([{ uid: 'x', url: 'https://store.steampowered.com/app/292030/' }])).toBe(292030);
    expect(steamAppIdFrom([{ uid: '16540', external_game_source: { id: 26, name: 'Epic Games Store' } }])).toBeNull();
    expect(steamAppIdFrom(undefined)).toBeNull();
  });

  it('converts seconds to hours and ignores missing data', () => {
    expect(timeToBeatHours({ normally: 115_200 })).toBe(32);
    expect(timeToBeatHours({ normally: 5_400 })).toBe(1.5);
    expect(timeToBeatHours({ normally: 0 })).toBeNull();
    expect(timeToBeatHours(undefined)).toBeNull();
    expect(mapGameDetails({}, undefined)).toMatchObject({
      title: null,
      imageUrl: null,
      igdbRating: null,
      releaseDate: null,
      timeToBeatHours: null,
      steamAppId: null,
    });
  });
});

describe('OpenLibrary', () => {
  it('fills genres from allow-listed subjects and keeps only the year', () => {
    const r = mapBookDoc(olSearch.docs[0]);
    expect(r.year).toBe(1965);
    expect(r.fields).toMatchObject({ genres: ['Science Fiction', 'Fantasy'] });
    expect(r.fields).not.toHaveProperty('releaseDate');
  });

  it('maps a work: genres and the description object', () => {
    expect(mapWork(olWork)).toEqual({
      title: 'Dune',
      // -1 marks a removed cover; the first real one is used, at search's size.
      imageUrl: 'https://covers.openlibrary.org/b/id/11481354-L.jpg',
      genres: ['Science Fiction', 'Fantasy'],
      description: 'Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides.',
    });
    expect(mapWork({ description: 'Plain text.' })).toMatchObject({
      description: 'Plain text.',
      title: null,
      imageUrl: null,
    });
  });
});

describe('Last.fm', () => {
  it('takes the top 3 usable tags as genres, plus the track count', () => {
    expect(mapAlbumInfo(lastfmInfo)).toEqual({ genres: ['Pop', 'Dance', 'Synth-Pop'], trackCount: 3 });
  });

  it('handles single-object tag / track lists', () => {
    expect(mapAlbumInfo(lastfmSingle)).toEqual({ genres: ['Ambient'], trackCount: 1 });
  });

  it('returns null for an API error and copes with empty tags', () => {
    expect(mapAlbumInfo(lastfmError)).toBeNull();
    expect(mapAlbumInfo({ album: { tags: '', tracks: '' } })).toEqual({ genres: [], trackCount: null });
  });
});
