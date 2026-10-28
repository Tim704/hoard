import { describe, expect, it } from 'vitest';

import type { PrismaModel } from './categories';
import {
  catalogueCreatePayload,
  fillOnlyUpdate,
  safeImageUrl,
  sanitizeCatalogueFields,
  upsertUpdatePayload,
  writableColumns,
} from './media-upsert';

const MODELS: PrismaModel[] = ['book', 'movie', 'tvShow', 'anime', 'manga', 'videoGame', 'musicAlbum'];
const TMDB = 'https://image.tmdb.org/t/p/w500/x.jpg';

/** Every relation shape an attacker could try (spec C1). */
const RELATION_ATTACK = {
  activities: { create: [{ userId: 'victim', category: 'MOVIE', status: 'COMPLETED' }] },
  seasons: { create: [{ number: 1 }], connect: [{ id: 's1' }] },
  user: { connect: { id: 'victim' } },
  connect: { id: 'victim' },
  connectOrCreate: { where: { id: 'x' }, create: {} },
  diaryEntries: { create: [] },
};

describe('upsertUpdatePayload', () => {
  it('drops null, undefined, blank strings and empty arrays', () => {
    const fields = {
      externalId: '/works/OL1W',
      title: 'Dune',
      description: null,
      runtime: null,
      episodeCount: undefined,
      isbn: '  ',
      genres: [],
      authors: ['Frank Herbert'],
      year: 1965,
    };
    expect(upsertUpdatePayload(fields)).toEqual({
      externalId: '/works/OL1W',
      title: 'Dune',
      authors: ['Frank Herbert'],
      year: 1965,
    });
  });

  it('keeps real values, including 0, false and dates', () => {
    const at = new Date('2026-10-28T00:00:00Z');
    expect(upsertUpdatePayload({ tmdbRating: 0, rewatch: false, metaFetchedAt: at })).toEqual({
      tmdbRating: 0,
      rewatch: false,
      metaFetchedAt: at,
    });
  });
});

describe('writableColumns (the allow-list)', () => {
  it.each(MODELS)('%s: scalar columns only, never relations or server-owned ones', (model) => {
    const cols = writableColumns(model);
    expect(cols.has('title')).toBe(true);
    for (const key of ['activities', 'seasons', 'id', 'externalId', 'createdAt', 'franchiseKey', 'franchiseName', 'metaFetchedAt', 'metaFailedAt']) {
      expect(cols.has(key)).toBe(false);
    }
  });
});

describe('catalogueCreatePayload', () => {
  it('pins externalId to the row key, so a manual id cannot be injected', () => {
    const out = catalogueCreatePayload('movie', '550', { externalId: 'manual:x', title: 'Fight Club' });
    expect(out).toEqual({ externalId: '550', title: 'Fight Club' });
  });

  it('never takes job bookkeeping from the client (a future stamp would hide the row)', () => {
    const out = catalogueCreatePayload('movie', '550', {
      title: 'T',
      metaFetchedAt: new Date('2999-01-01'),
      metaFailedAt: new Date(),
    });
    expect(out).toEqual({ externalId: '550', title: 'T' });
  });

  it('drops server-owned columns', () => {
    const out = catalogueCreatePayload('movie', '550', {
      id: 'hijack',
      title: 'T',
      franchiseKey: 'tmdb-col:1',
      franchiseName: 'X',
      metaFailedAt: new Date(),
      createdAt: new Date(0),
    });
    expect(out).toEqual({ externalId: '550', title: 'T' });
  });

  it.each(MODELS)('%s: drops every relation key and nested write shape (C1 exploit)', (model) => {
    const out = catalogueCreatePayload(model, '1', { title: 'T', ...RELATION_ATTACK });
    expect(out).toEqual({ externalId: '1', title: 'T' });
  });

  it('TvShow: `seasons` (a relation) never reaches Prisma', () => {
    const out = catalogueCreatePayload('tvShow', '1399', {
      title: 'GoT',
      seasonCount: 8,
      seasons: { create: [{ number: 1, episodeCount: 10 }] },
    });
    expect(out).toEqual({ externalId: '1399', title: 'GoT', seasonCount: 8 });
  });

  it('drops nested objects and arrays in scalar columns', () => {
    const out = catalogueCreatePayload('movie', '1', {
      title: { set: 'X' },
      description: ['a'],
      runtime: { increment: 1 },
      tmdbRating: [1],
    });
    expect(out).toEqual({ externalId: '1', title: 'Untitled' });
    expect(catalogueCreatePayload('movie', '1', { title: { set: 'X' } }, 'Real title').title).toBe('Real title');
  });

  it('takes arrays only for String[] columns, strings only', () => {
    const out = catalogueCreatePayload('book', '/works/1', {
      title: 'T',
      authors: ['A', 3, { x: 1 }, 'B'],
      genres: 'Fiction',
      year: [1999],
    });
    expect(out).toEqual({ externalId: '/works/1', title: 'T', authors: ['A', 'B'] });
    const long = Array.from({ length: 300 }, (_, i) => `g${i}`);
    expect((catalogueCreatePayload('book', '/works/1', { title: 'T', genres: long }).genres as string[]).length).toBe(100);
  });

  it('caps string lengths', () => {
    const out = catalogueCreatePayload('movie', '1', {
      title: 't'.repeat(900),
      description: 'd'.repeat(20_000),
      releaseDate: 'r'.repeat(900),
      imageUrl: TMDB + '?' + 'q'.repeat(3000),
    });
    expect((out.title as string).length).toBe(500);
    expect((out.description as string).length).toBe(10_000);
    expect((out.releaseDate as string).length).toBe(500);
    expect(out.imageUrl).toBeNull(); // over 2000: not a URL we keep
    const cast = catalogueCreatePayload('movie', '1', { title: 'T', cast: ['c'.repeat(900)] }).cast as string[];
    expect(cast[0].length).toBe(500);
  });

  it('drops invalid numbers', () => {
    const out = catalogueCreatePayload('movie', '1', {
      title: 'T',
      year: NaN,
      runtime: Infinity,
      tmdbRating: -Infinity,
    });
    expect(out).toEqual({ externalId: '1', title: 'T' });
    expect(catalogueCreatePayload('movie', '1', { title: 'T', year: 2 ** 40 })).not.toHaveProperty('year');
    expect(catalogueCreatePayload('movie', '1', { title: 'T', runtime: 1.5 })).not.toHaveProperty('runtime');
    expect(catalogueCreatePayload('movie', '1', { title: 'T', year: '1999' })).not.toHaveProperty('year');
    expect(catalogueCreatePayload('movie', '1', { title: 'T', year: 1999, tmdbRating: 7.9 })).toMatchObject({
      year: 1999,
      tmdbRating: 7.9,
    });
  });

  it('accepts ISO dates for DateTime columns and drops junk', () => {
    expect(catalogueCreatePayload('anime', '1', { title: 'T', nextAiringAt: '2027-01-01T00:00:00.000Z' }).nextAiringAt).toEqual(
      new Date('2027-01-01T00:00:00.000Z'),
    );
    expect(catalogueCreatePayload('anime', '1', { title: 'T', nextAiringAt: 'soon' })).not.toHaveProperty('nextAiringAt');
    expect(catalogueCreatePayload('anime', '1', { title: 'T', nextAiringAt: 12 })).not.toHaveProperty('nextAiringAt');
  });

  it('keeps provider-CDN https covers only (M1); others become null', () => {
    expect(catalogueCreatePayload('movie', '1', { title: 'T', imageUrl: TMDB }).imageUrl).toBe(TMDB);
    expect(catalogueCreatePayload('movie', '1', { title: 'T', imageUrl: 'http://image.tmdb.org/x.jpg' }).imageUrl).toBeNull();
    expect(catalogueCreatePayload('movie', '1', { title: 'T', imageUrl: 'https://evil.example/x.jpg' }).imageUrl).toBeNull();
    expect(catalogueCreatePayload('movie', '1', { title: 'T', imageUrl: 'https://image.tmdb.org:8443/x.jpg' }).imageUrl).toBeNull();
    expect(catalogueCreatePayload('movie', '1', { title: 'T', imageUrl: '' }).imageUrl).toBeNull();
    expect(catalogueCreatePayload('movie', '1', { title: 'T', imageUrl: 'javascript:alert(1)' }).imageUrl).toBeNull();
    expect(catalogueCreatePayload('movie', '1', { title: 'T', backdropUrl: 'https://evil.example/b.jpg' }).backdropUrl).toBeNull();
  });

  it('a manual row keeps any https cover (its own rule), but never http', () => {
    expect(catalogueCreatePayload('movie', 'manual:c1', { title: 'T', imageUrl: 'https://my.site/x.jpg' }).imageUrl).toBe(
      'https://my.site/x.jpg',
    );
    expect(catalogueCreatePayload('movie', 'manual:c1', { title: 'T', imageUrl: 'http://my.site/x.jpg' }).imageUrl).toBeNull();
  });

  it('keeps a real provider hit intact for every model', () => {
    const hits: Record<PrismaModel, Record<string, unknown>> = {
      book: { title: 'Dune', authors: ['Frank Herbert'], pageCount: 412, isbn: '9780441013593', year: 1965 },
      movie: { title: 'Fight Club', runtime: 139, tmdbRating: 8.4, directors: ['David Fincher'], cast: ['Brad Pitt'] },
      tvShow: { title: 'GoT', episodeCount: 73, seasonCount: 8, status: 'Ended', episodeRunTime: 57 },
      anime: { title: 'Frieren', episodes: 28, malScore: 9.1, studio: 'Madhouse', titleNative: 'フリーレン' },
      manga: { title: 'Berserk', chapters: 380, volumes: 42, titleRomaji: 'Berserk' },
      videoGame: { title: 'Hades', platforms: ['PC'], igdbRating: 93, timeToBeatHours: 22.5 },
      musicAlbum: { title: 'OK Computer', artist: 'Radiohead', trackCount: 12 },
    };
    for (const model of MODELS) {
      expect(catalogueCreatePayload(model, 'x1', hits[model])).toEqual({ externalId: 'x1', ...hits[model] });
    }
  });
});

describe('sanitizeCatalogueFields', () => {
  it('returns nothing for a non-object', () => {
    expect(sanitizeCatalogueFields('movie', null as never, { manual: false })).toEqual({});
    expect(sanitizeCatalogueFields('movie', ['x'] as never, { manual: false })).toEqual({});
  });

  it('safeImageUrl rejects credentials and odd ports', () => {
    expect(safeImageUrl('https://u:p@image.tmdb.org/x.jpg', false)).toBeNull();
    expect(safeImageUrl('https://u:p@my.site/x.jpg', true)).toBeNull();
    expect(safeImageUrl(5, false)).toBeNull();
  });
});

describe('fillOnlyUpdate', () => {
  const stored = {
    id: 'm1',
    externalId: '550',
    title: 'Fight Club',
    imageUrl: TMDB,
    description: null,
    runtime: null,
    genres: [] as string[],
    tmdbRating: 8.4,
    franchiseName: null,
    backdropUrl: null,
  };

  it('never overwrites stored values', () => {
    expect(fillOnlyUpdate('movie', stored, { title: 'Renamed', imageUrl: 'https://evil/x.jpg', tmdbRating: 1 })).toEqual({});
  });

  it('fills only empty columns with non-empty values', () => {
    expect(
      fillOnlyUpdate('movie', stored, { description: 'Soap.', runtime: 139, genres: ['Drama'], title: 'X' }),
    ).toEqual({ description: 'Soap.', runtime: 139, genres: ['Drama'] });
    expect(fillOnlyUpdate('movie', stored, { description: '  ', runtime: null, genres: [] })).toEqual({});
  });

  it('never fills job bookkeeping, even when it is stored empty', () => {
    const row = { ...stored, metaFetchedAt: null, metaFailedAt: null };
    expect(fillOnlyUpdate('movie', row, { metaFetchedAt: new Date('2999-01-01'), metaFailedAt: new Date() })).toEqual({});
  });

  it('never touches identity or grouping, even when empty, nor unknown columns', () => {
    expect(fillOnlyUpdate('movie', stored, { externalId: 'manual:x', id: 'z', franchiseName: 'Mine', bogus: 1 })).toEqual({});
  });

  it.each(MODELS)('%s: relation keys and nested shapes never reach the update (C1 exploit)', (model) => {
    const row = { id: 'm1', externalId: '1', title: 'T', activities: null, seasons: null, user: null, connect: null };
    expect(fillOnlyUpdate(model, row, RELATION_ATTACK)).toEqual({});
  });

  it('fills an empty cover only with a provider-CDN https URL', () => {
    const row = { ...stored, imageUrl: null };
    expect(fillOnlyUpdate('movie', row, { imageUrl: 'https://evil.example/x.jpg' })).toEqual({});
    expect(fillOnlyUpdate('movie', row, { imageUrl: TMDB })).toEqual({ imageUrl: TMDB });
  });
});

describe('steamAppId is a trusted provider column (re-review 1)', () => {
  it('a client steamAppId is dropped on create and on fill', () => {
    expect(catalogueCreatePayload('videoGame', '1942', { title: 'Witcher 3', steamAppId: 570 })).toEqual({
      externalId: '1942',
      title: 'Witcher 3',
    });
    const stored = { id: 'g1', externalId: '1942', title: 'Witcher 3', steamAppId: null };
    expect(fillOnlyUpdate('videoGame', stored, { steamAppId: 570 })).toEqual({});
  });

  it('the enrichment-provided (trusted) id is kept, type-checked, on create and fill', () => {
    expect(catalogueCreatePayload('videoGame', '1942', { title: 'W3', steamAppId: 570 }, undefined, { steamAppId: 292030 })).toEqual({
      externalId: '1942',
      title: 'W3',
      steamAppId: 292030,
    });
    const stored = { id: 'g1', externalId: '1942', title: 'W3', steamAppId: null };
    expect(fillOnlyUpdate('videoGame', stored, {}, { steamAppId: 292030 })).toEqual({ steamAppId: 292030 });
    expect(fillOnlyUpdate('videoGame', { ...stored, steamAppId: 1 }, {}, { steamAppId: 292030 })).toEqual({});
    expect(catalogueCreatePayload('videoGame', '1', { title: 'T' }, undefined, { steamAppId: 'x' })).not.toHaveProperty('steamAppId');
  });

  it('trusted input sets only trusted columns (no smuggling other columns through it)', () => {
    expect(catalogueCreatePayload('videoGame', '1', { title: 'T' }, undefined, { title: 'Forged', igdbRating: 1, activities: {} })).toEqual({
      externalId: '1',
      title: 'T',
    });
  });
});
