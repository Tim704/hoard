import { describe, expect, it } from 'vitest';

import { editionWorkKey, mapEditionFallback } from './books';
import { gameBySlugQuery, steamExternalQuery } from './igdb';
import { mapFindResult } from './tmdb';

describe('TMDB /find', () => {
  it('prefers the film, then the show, else null', () => {
    const movie = { id: 603, title: 'The Matrix', release_date: '1999-03-30', poster_path: '/p.jpg', vote_average: 8.2 };
    const tv = { id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20' };
    expect(mapFindResult({ movie_results: [movie], tv_results: [tv] })).toMatchObject({
      kind: 'movie',
      result: { externalId: '603', title: 'The Matrix', year: 1999, imageUrl: 'https://image.tmdb.org/t/p/w500/p.jpg' },
    });
    expect(mapFindResult({ movie_results: [], tv_results: [tv] })).toMatchObject({ kind: 'tv', result: { externalId: '1396', year: 2008 } });
    expect(mapFindResult({})).toBeNull();
  });
});

describe('IGDB link queries', () => {
  it('builds a slug query and refuses odd slugs', () => {
    expect(gameBySlugQuery('the-witcher-3-wild-hunt')).toMatch(/^where slug = "the-witcher-3-wild-hunt"; fields .*cover\.image_id.*; limit 1;$/);
    expect(gameBySlugQuery('a"; fields *')).toBeNull();
    expect(gameBySlugQuery('')).toBeNull();
  });

  it('looks a Steam app id up through the Steam external game source', () => {
    expect(steamExternalQuery('570')).toBe('where uid = "570" & external_game_source = 1; fields game; limit 1;');
    expect(steamExternalQuery('570"; x')).toBeNull();
  });
});

describe('OpenLibrary editions', () => {
  const edition = {
    key: '/books/OL22597282M',
    title: 'Dune',
    works: [{ key: '/works/OL893414W' }],
    covers: [-1, 15166231],
    number_of_pages: 535,
    publish_date: 'March 1987',
  };

  it('finds the work key', () => {
    expect(editionWorkKey(edition)).toBe('/works/OL893414W');
    expect(editionWorkKey({ works: [{ key: '/authors/OL1A' }] })).toBeNull();
    expect(editionWorkKey({})).toBeNull();
  });

  it('builds a bare book result when search does not list the work', () => {
    expect(mapEditionFallback(edition, '/isbn/9780441172719')).toMatchObject({
      externalId: '/works/OL893414W',
      title: 'Dune',
      year: 1987,
      imageUrl: 'https://covers.openlibrary.org/b/id/15166231-L.jpg',
      fields: { externalId: '/works/OL893414W', pageCount: 535, authors: [] },
    });
    expect(mapEditionFallback({ ...edition, works: [] }, '/isbn/9780441172719')).toMatchObject({ externalId: '/books/OL22597282M' });
    expect(mapEditionFallback({ title: 'X' }, '/isbn/9780441172719')).toBeNull();
    expect(mapEditionFallback({ works: [{ key: '/works/OL1W' }] }, '/books/OL1M')).toBeNull();
  });
});
