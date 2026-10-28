import { afterEach, describe, expect, it, vi } from 'vitest';

import anilistAnime from '@/lib/apis/__fixtures__/anilist-anime.json';
import olSearch from '@/lib/apis/__fixtures__/openlibrary-search.json';
import tmdbSearch from '@/lib/apis/__fixtures__/tmdb-movie-search.json';
import { anilistGraphql, fetchAniListByIds, mapAnime, type AniListMedia } from '@/lib/apis/anilist';
import { mapBookDoc, searchBooksByIsbn } from '@/lib/apis/books';
import { mapMovieSearchHit, searchMovies } from '@/lib/apis/tmdb';
import type { CategorySlug } from '@/lib/categories';
import type { NormalizedResult } from '@/lib/types';

import { matchRows, notConfiguredMessage, type MatchDeps } from './matcher';
import { NEW_MANUAL_ID, type ImportRow, type InLibrary } from './types';
import { planImportUpdate } from './update';

const movies = tmdbSearch.results.map((m) => mapMovieSearchHit(m as any));
const dune = (olSearch.docs as any[]).map(mapBookDoc);
const frieren = mapAnime(anilistAnime.data.Page.media[0] as AniListMedia);

const stored = (externalId: string, title: string, year: number | null = null): NormalizedResult => ({
  externalId,
  title,
  year,
  imageUrl: null,
  subtitle: null,
  description: null,
  fields: { externalId, title },
});

/** Fake deps: a tiny catalogue + library, fixture-backed providers, call log. */
function fakeDeps(over: Partial<MatchDeps> = {}, opts: { catalogue?: Record<string, NormalizedResult>; library?: Record<string, InLibrary> } = {}) {
  const calls: string[] = [];
  const deps: MatchDeps = {
    async catalogue(slug, ids) {
      calls.push(`catalogue:${slug}:${ids.join(',')}`);
      return new Map(ids.filter((id) => opts.catalogue?.[id]).map((id) => [id, opts.catalogue![id]]));
    },
    async ownManual() {
      return Object.entries(opts.library ?? {})
        .filter(([id]) => id.startsWith('manual:'))
        .map(([id]) => opts.catalogue?.[id] ?? stored(id, id));
    },
    async library(slug, ids) {
      calls.push(`library:${slug}`);
      return new Map(ids.filter((id) => opts.library?.[id]).map((id) => [id, opts.library![id]]));
    },
    configured: () => true,
    async search(slug: CategorySlug, q: string) {
      calls.push(`search:${slug}:${q}`);
      return { source: 'x', results: [] };
    },
    async searchMovies(title, year) {
      calls.push(`movies:${title}:${year ?? ''}`);
      return title === 'The Matrix' ? movies.filter((m) => !year || m.year === year) : [];
    },
    async booksByIsbn(isbn) {
      calls.push(`isbn:${isbn}`);
      return isbn === '9780441013593' ? dune : [];
    },
    async booksByTitle(title, author) {
      calls.push(`title:${title}:${author ?? ''}`);
      return title === 'Dune' ? dune : [];
    },
    async aniListByIds(type, ids) {
      calls.push(`anilist:${type}:${ids.join(',')}`);
      return new Map(ids.filter((id) => id === 154587).map((id) => [id, frieren]));
    },
    async aniListByMalIds(type, ids) {
      calls.push(`anilist-mal:${type}:${ids.join(',')}`);
      return new Map(ids.filter((id) => String(id) === frieren.externalId).map((id) => [id, frieren]));
    },
    pause: async () => {
      calls.push('pause');
    },
    ...over,
  };
  return { deps, calls };
}

const base = { ids: {}, status: 'COMPLETED' as const };

describe('matchRows', () => {
  it('MAL rows: the catalogue by MAL id, else AniList by idMal, else a title search', async () => {
    const { deps, calls } = fakeDeps({}, { catalogue: { '1': stored('1', 'Cowboy Bebop', 1998) } });
    const [bebop, fr, unknown] = await matchRows(
      [
        { ...base, source: 'mal', category: 'anime', title: 'Cowboy Bebop', ids: { mal: '1' } },
        { ...base, source: 'mal', category: 'anime', title: 'Frieren', ids: { mal: frieren.externalId } },
        { ...base, source: 'mal', category: 'anime', title: 'Nope', ids: { mal: '999999' } },
      ],
      deps,
    );
    expect(bebop).toMatchObject({ confidence: 'high' });
    expect(bebop.candidates[0].externalId).toBe('1');
    expect(fr.confidence).toBe('high');
    expect(fr.candidates[0].externalId).toBe(frieren.externalId);
    expect(unknown.confidence).toBe('none');
    expect(calls).toContain(`anilist-mal:ANIME:${frieren.externalId},999999`);
    expect(calls).toContain('search:anime:Nope');
    expect(calls.some((c) => c.startsWith('anilist:'))).toBe(false);
  });

  it('Trakt rows: a TMDB id in the catalogue, else the search hit with that id wins', async () => {
    const { deps, calls } = fakeDeps({}, { catalogue: { '1396': stored('1396', 'Breaking Bad', 2008) } });
    const [show, film, other] = await matchRows(
      [
        { ...base, source: 'trakt', category: 'tv', title: 'Breaking Bad', year: 2008, ids: { tmdb: '1396' } },
        // A different year would be "low" by title, but the id settles it.
        { ...base, source: 'trakt', category: 'movies', title: 'The Matrix', ids: { tmdb: '603' } },
        { ...base, source: 'trakt', category: 'movies', title: 'The Matrix', ids: { tmdb: 'x1' } },
      ],
      deps,
    );
    expect(show.confidence).toBe('high');
    expect(show.candidates[0].externalId).toBe('1396');
    expect(film.confidence).toBe('high');
    expect(film.candidates[0].externalId).toBe('603');
    expect(other.confidence).not.toBe('none');
    expect(calls).toContain('catalogue:tv:1396');
    expect(calls).toContain('catalogue:movies:603');
  });

  it('Letterboxd film: TMDB by title + year → high; a year with no hit retries without it', async () => {
    const { deps, calls } = fakeDeps();
    const [hit, retry] = await matchRows(
      [
        { ...base, source: 'letterboxd', category: 'movies', title: 'The Matrix', year: 1999 },
        { ...base, source: 'letterboxd', category: 'movies', title: 'The Matrix', year: 2001 },
      ],
      deps,
    );
    expect(hit).toMatchObject({ confidence: 'high', chosenIndex: 0, inLibrary: null });
    expect(hit.candidates[0].externalId).toBe('603');
    expect(retry.confidence).toBe('low'); // same title, different year
    expect(calls).toContain('movies:The Matrix:2001');
    expect(calls).toContain('movies:The Matrix:');
  });

  it('no hit → none; a missing TMDB key → none with a clear message and no search', async () => {
    const { deps } = fakeDeps();
    const [none] = await matchRows([{ ...base, source: 'letterboxd', category: 'movies', title: 'Zzz Unknown' }], deps);
    expect(none).toMatchObject({ confidence: 'none', chosenIndex: -1, candidates: [] });

    const off = fakeDeps({ configured: (s) => s !== 'movies' });
    const [res] = await matchRows([{ ...base, source: 'letterboxd', category: 'movies', title: 'The Matrix', year: 1999 }], off.deps);
    expect(res.confidence).toBe('none');
    expect(res.message).toBe(notConfiguredMessage('movies'));
    expect(res.message).toMatch(/TMDB isn't configured/);
    expect(off.calls.some((c) => c.startsWith('movies:'))).toBe(false);
  });

  it('books: ISBN13 → ISBN10 → title + author', async () => {
    const { deps, calls } = fakeDeps();
    const [byIsbn, byTitle] = await matchRows(
      [
        { ...base, source: 'goodreads', category: 'books', title: 'Dune (whatever edition)', ids: { isbn: '9780441013593' } },
        { ...base, source: 'goodreads', category: 'books', title: 'Dune', author: 'Frank Herbert', year: 1965, ids: { isbn: '9999999999999', isbn10: '0000000000' } },
      ],
      deps,
    );
    expect(byIsbn).toMatchObject({ confidence: 'high' });
    expect(byIsbn.candidates[0].externalId).toBe('/works/OL893414W');
    expect(byTitle.confidence).toBe('high'); // title + year
    expect(calls).toEqual(expect.arrayContaining(['isbn:9999999999999', 'isbn:0000000000', 'title:Dune:Frank Herbert']));
  });

  it('AniList: MAL id, then al- id in the catalogue, then AniList by id; flags titles already in the library', async () => {
    const { deps, calls } = fakeDeps(
      {},
      {
        catalogue: { '1': stored('1', 'Cowboy Bebop', 1998), 'al-999': stored('al-999', 'Obscure', 2020) },
        library: { '1': { activityId: 'act1', status: 'COMPLETED' } },
      },
    );
    const rows: ImportRow[] = [
      { ...base, source: 'anilist', category: 'anime', title: 'Cowboy Bebop', ids: { anilist: '1', mal: '1' } },
      { ...base, source: 'anilist', category: 'anime', title: 'Obscure', ids: { anilist: '999', mal: '777' } },
      { ...base, source: 'anilist', category: 'anime', title: 'Frieren', ids: { anilist: '154587', mal: '52991' } },
    ];
    const [bebop, obscure, fr] = await matchRows(rows, deps);
    expect(bebop).toMatchObject({ confidence: 'high', inLibrary: { activityId: 'act1', status: 'COMPLETED' } });
    expect(obscure.candidates[0].externalId).toBe('al-999');
    expect(obscure.inLibrary).toBeNull();
    expect(fr.candidates[0]).toEqual(frieren); // identical to a search add
    expect(fr.confidence).toBe('high');
    expect(calls).toContain('anilist:ANIME:154587');
  });

  it('AniList ids that are not numbers never reach the catalogue', async () => {
    const { deps, calls } = fakeDeps({}, { catalogue: { 'manual:cx': stored('manual:cx', 'Theirs') } });
    const [res] = await matchRows(
      [{ ...base, source: 'anilist', category: 'anime', title: 'Theirs', ids: { anilist: '5', mal: 'manual:cx' } }],
      deps,
    );
    expect(res.candidates.some((c) => c.externalId === 'manual:cx')).toBe(false);
    expect(calls.find((c) => c.startsWith('catalogue:anime'))).toBe('catalogue:anime:al-5');
  });

  it('Hoard CSV: externalId from the catalogue, else title search', async () => {
    const { deps, calls } = fakeDeps({}, { catalogue: { '603': stored('603', 'The Matrix', 1999) } });
    const [direct, gone] = await matchRows(
      [
        { ...base, source: 'hoard', category: 'movies', title: 'The Matrix', externalId: '603' },
        { ...base, source: 'hoard', category: 'movies', title: 'The Matrix', year: 1999, externalId: '999999' },
      ],
      deps,
    );
    expect(direct).toMatchObject({ confidence: 'high' });
    expect(gone.candidates[0].externalId).toBe('603');
    expect(calls.filter((c) => c.startsWith('movies:'))).toEqual(['movies:The Matrix:1999']);
  });

  it('Hoard CSV hand-made rows: the user’s own entry, or a new hand-made one — never someone else’s', async () => {
    const mine = 'manual:cmine';
    const theirs = 'manual:ctheirs';
    const { deps } = fakeDeps(
      {},
      {
        catalogue: { [mine]: stored(mine, 'Mine'), [theirs]: stored(theirs, 'Theirs') },
        library: { [mine]: { activityId: 'a1', status: 'PLANNED' } },
      },
    );
    const [own, other, sameTitle] = await matchRows(
      [
        { ...base, source: 'hoard', category: 'games', title: 'Mine', externalId: mine },
        { ...base, source: 'hoard', category: 'games', title: 'Theirs', year: 2001, externalId: theirs },
        // Re-importing an export from another account: the user's own entry with that title.
        { ...base, source: 'hoard', category: 'games', title: 'mine!', externalId: 'manual:celsewhere' },
      ],
      deps,
    );
    expect(own).toMatchObject({ confidence: 'high', inLibrary: { activityId: 'a1' } });
    expect(sameTitle).toMatchObject({ confidence: 'high', inLibrary: { activityId: 'a1' } });
    expect(sameTitle.candidates[0].externalId).toBe(mine);
    expect(other.candidates[0].externalId).toBe(NEW_MANUAL_ID);
    expect(other.candidates[0].year).toBe(2001);
    expect(other.confidence).toBe('medium');
    expect(other.inLibrary).toBeNull();
  });

  it('a provider error is a soft "none" with the reason, and searches are paced', async () => {
    const { deps, calls } = fakeDeps({
      async search() {
        throw new Error('boom');
      },
    });
    const res = await matchRows(
      [
        { ...base, source: 'hoard', category: 'games', title: 'A' },
        { ...base, source: 'hoard', category: 'games', title: 'B' },
      ],
      deps,
    );
    expect(res.map((r) => r.confidence)).toEqual(['none', 'none']);
    expect(res[0].message).toBe('Search failed: boom');
    expect(calls.filter((c) => c === 'pause')).toHaveLength(1);
  });
});

describe('planImportUpdate', () => {
  const ids = { userId: 'u', activityId: 'a' };
  const now = { status: 'PLANNED' as const, rating: null, startedAt: null, finishedAt: null, progress: null, tags: ['x'], favorite: false };

  it('applies what the row carries, merges tags, leaves Up next and records events', () => {
    const finished = new Date('2024-03-09T12:00:00Z');
    const plan = planImportUpdate(ids, now, { status: 'COMPLETED', rating: 8, finishedAt: finished, progress: 3, tags: ['y', 'x'] });
    expect(plan.patch).toEqual({ status: 'COMPLETED', rating: 8, finishedAt: finished, progress: 3, tags: ['x', 'y'] });
    expect(plan.queue).toBe('leave');
    expect(plan.events.map((e) => [e.kind, e.from, e.to])).toEqual([
      ['status', 'PLANNED', 'COMPLETED'],
      ['score', null, '8'],
      ['progress', null, '3'],
    ]);
  });

  it('never clears or moves back: Planned over Completed keeps Completed and its score', () => {
    const current = { ...now, status: 'COMPLETED' as const, rating: 7, finishedAt: new Date('2020-01-01T00:00:00Z') };
    const plan = planImportUpdate(ids, current, { status: 'PLANNED', rating: null, finishedAt: null, tags: [] });
    expect(plan).toEqual({ patch: {}, queue: null, events: [] });
  });

  it('a backwards status still fills a missing score and turns a favourite on', () => {
    const current = { ...now, status: 'COMPLETED' as const };
    const plan = planImportUpdate(ids, current, { status: 'CONSUMING', rating: 6, favorite: true });
    expect(plan.patch).toEqual({ rating: 6, favorite: true });
    expect(plan.queue).toBeNull();
    expect(plan.events.map((e) => e.kind)).toEqual(['score']);
  });

  it('Dropped moves on to Completed, Completed never back to Ongoing', () => {
    expect(planImportUpdate(ids, { ...now, status: 'DROPPED' }, { status: 'COMPLETED' }).patch).toEqual({ status: 'COMPLETED' });
    expect(planImportUpdate(ids, { ...now, status: 'COMPLETED' }, { status: 'CONSUMING' }).patch).toEqual({});
  });

  it('nothing to do → empty patch, no events', () => {
    const plan = planImportUpdate(ids, now, { status: 'PLANNED', tags: ['x'] });
    expect(plan).toEqual({ patch: {}, queue: null, events: [] });
  });
});

describe('provider helpers for imports', () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('searchMovies passes the year to TMDB', async () => {
    vi.stubEnv('TMDB_API_KEY', 'k');
    const fetchMock = vi.fn(async () => json(tmdbSearch));
    vi.stubGlobal('fetch', fetchMock);
    await searchMovies('The Matrix', 1999);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/[?&]query=The%20Matrix&year=1999$/);
  });

  it('searchBooksByIsbn asks OpenLibrary by isbn and stamps the asked ISBN', async () => {
    const fetchMock = vi.fn(async () => json(olSearch));
    vi.stubGlobal('fetch', fetchMock);
    const [hit] = await searchBooksByIsbn('9780441013593');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('isbn=9780441013593');
    expect(hit.fields.isbn).toBe('9780441013593');
    expect(await searchBooksByIsbn('not-an-isbn')).toEqual([]);
  });

  it('fetchAniListByIds maps entries exactly like search hits, keyed by AniList id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(anilistAnime)));
    const map = await fetchAniListByIds('ANIME', [154587, 200001]);
    expect(map.get(154587)).toEqual(frieren);
    expect(map.get(200001)?.externalId).toBe('al-200001');
  });
});

describe('anilistGraphql', () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('returns GraphQL errors (unknown or private user) after one attempt', async () => {
    const fetchMock = vi.fn(async () => answer({ data: { MediaListCollection: null }, errors: [{ message: 'User not found', status: 404 }] }, 404));
    vi.stubGlobal('fetch', fetchMock);
    const res = await anilistGraphql('q', {}, 'AniList list');
    expect(res.errors[0].message).toBe('User not found');
    expect(res.data).toEqual({ MediaListCollection: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx, then answers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('oops', { status: 502 }))
      .mockResolvedValueOnce(answer({ data: { ok: 1 } }, 200));
    vi.stubGlobal('fetch', fetchMock);
    const res = await anilistGraphql<{ ok: number }>('q', {}, 'AniList list');
    expect(res).toEqual({ data: { ok: 1 }, errors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
