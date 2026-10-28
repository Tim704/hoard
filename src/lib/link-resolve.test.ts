import { describe, expect, it, vi } from 'vitest';

import { resolveMediaLink, type LinkDeps } from './link-resolve';
import type { NormalizedResult } from './types';

const hit = (externalId: string, title = externalId): NormalizedResult => ({
  externalId, title, imageUrl: null, subtitle: null, year: null, description: null, fields: { externalId, title },
});

function deps(over: Partial<LinkDeps> = {}): LinkDeps {
  return {
    tmdbById: vi.fn(async (_k, id) => hit(id)),
    findImdb: vi.fn(async () => ({ kind: 'tv' as const, result: hit('1396') })),
    aniList: vi.fn(async (_t, id) => hit(`al-${id}`)),
    aniListByMal: vi.fn(async (_t, id) => hit(String(id))),
    igdbBySlug: vi.fn(async (slug) => hit(`igdb:${slug}`)),
    igdbBySteam: vi.fn(async (id) => hit(`steam:${id}`)),
    isbn: vi.fn(async (isbn) => hit(`/works/isbn-${isbn}`)),
    booksByTitle: vi.fn(async (t) => [hit(`/works/title-${t}`)]),
    movies: vi.fn(async (q, y) => [hit(`${q}${y ? `|${y}` : ''}`)]),
    openLibrary: vi.fn(async (key) => hit(key)),
    page: vi.fn(async () => null),
    ...over,
  };
}

describe('resolveMediaLink', () => {
  it('looks recognised links up with the right provider', async () => {
    const d = deps();
    expect(await resolveMediaLink('https://www.themoviedb.org/tv/1396', d)).toMatchObject({ slug: 'tv', result: { externalId: '1396' } });
    expect(d.tmdbById).toHaveBeenCalledWith('tv', '1396');
    expect(await resolveMediaLink('https://m.imdb.com/title/tt0903747/', d)).toMatchObject({ provider: 'imdb', slug: 'tv' });
    expect(await resolveMediaLink('https://anilist.co/manga/30013', d)).toMatchObject({ slug: 'manga', result: { externalId: 'al-30013' } });
    expect(d.aniList).toHaveBeenCalledWith('MANGA', 30013);
    expect(await resolveMediaLink('https://myanimelist.net/anime/1/Cowboy_Bebop', d)).toMatchObject({ slug: 'anime', result: { externalId: '1' } });
    expect(await resolveMediaLink('https://www.igdb.com/games/hades', d)).toMatchObject({ slug: 'games', result: { externalId: 'igdb:hades' } });
    expect(await resolveMediaLink('https://store.steampowered.com/app/1145360/Hades/', d)).toMatchObject({ result: { externalId: 'steam:1145360' } });
    expect(await resolveMediaLink('https://openlibrary.org/works/OL893414W', d)).toMatchObject({ slug: 'books', result: { externalId: '/works/OL893414W' } });
    expect(d.page).not.toHaveBeenCalled();
  });

  it('searches TMDB by a Letterboxd slug, retrying without the slug year', async () => {
    const movies = vi.fn(async (q: string, y?: number) => (y ? [] : [hit(q)]));
    const res = await resolveMediaLink('https://letterboxd.com/film/dune-2021/', deps({ movies }));
    expect(movies.mock.calls).toEqual([['dune', 2021], ['dune']]);
    expect(res).toMatchObject({ slug: 'movies', result: { externalId: 'dune' } });
  });

  it('reads the ISBN from a Goodreads page, else searches the slug title', async () => {
    const page = vi.fn(async () => ({ url: 'x', html: '<meta property="books:isbn" content="9780441172719">' }));
    const d = deps({ page });
    expect(await resolveMediaLink('https://www.goodreads.com/book/show/44767458-dune', d)).toMatchObject({
      result: { externalId: '/works/isbn-9780441172719' },
    });
    const noIsbn = deps({ page: vi.fn(async () => ({ url: 'x', html: '<title>Goodreads</title>' })) });
    const res = await resolveMediaLink('https://www.goodreads.com/book/show/44767458-dune', noIsbn);
    expect(noIsbn.booksByTitle).toHaveBeenCalledWith('dune');
    expect(res).toMatchObject({ slug: 'books', guess: 'dune', result: { externalId: '/works/title-dune' } });
  });

  it('reads an unknown link’s page title as the guess', async () => {
    const page = vi.fn(async () => ({ url: 'x', html: '<title>Frieren - Wikipedia</title>' }));
    const res = await resolveMediaLink('https://en.wikipedia.org/wiki/Frieren', deps({ page }));
    expect(res).toEqual({ provider: null, slug: null, result: null, guess: 'Frieren' });
    const odd = vi.fn(async () => ({ url: 'x', html: '<title>&#99999999;Dune</title>' }));
    expect(await resolveMediaLink('https://example.com/x', deps({ page: odd }))).toMatchObject({ guess: '\uFFFDDune' });
    const failing = await resolveMediaLink('https://boxd.it/abc', deps({ page: vi.fn(async () => { throw new Error('x'); }) }));
    expect(failing).toEqual({ provider: null, slug: null, result: null, guess: '' });
  });

  it('fails softly with a friendly message when a provider is not configured', async () => {
    const tmdbById = vi.fn(async () => {
      throw new Error('TMDB_API_KEY not configured');
    });
    const res = await resolveMediaLink('https://www.themoviedb.org/movie/603-the-matrix', deps({ tmdbById }));
    expect(res).toMatchObject({ provider: 'tmdb', slug: 'movies', result: null });
    expect(res.message).toMatch(/isn't set up/);
    const down = await resolveMediaLink('https://letterboxd.com/film/the-matrix/', deps({ movies: vi.fn(async () => { throw new Error('500'); }) }));
    expect(down).toMatchObject({ result: null, guess: 'the matrix' });
    expect(down.message).toMatch(/didn't answer/);
  });

  it('returns no result when the provider does not know the id', async () => {
    const res = await resolveMediaLink('https://anilist.co/anime/999999999', deps({ aniList: vi.fn(async () => null) }));
    expect(res).toMatchObject({ provider: 'anilist', slug: 'anime', result: null });
  });
});
