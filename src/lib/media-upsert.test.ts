import { describe, expect, it } from 'vitest';

import { catalogueCreatePayload, fillOnlyUpdate, upsertUpdatePayload } from './media-upsert';

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

describe('catalogueCreatePayload', () => {
  it('pins externalId to the row key, so a manual id cannot be injected', () => {
    const out = catalogueCreatePayload('550', { externalId: 'manual:x', title: 'Fight Club' });
    expect(out).toEqual({ externalId: '550', title: 'Fight Club' });
  });

  it('drops server-owned columns', () => {
    const out = catalogueCreatePayload('550', {
      id: 'hijack',
      title: 'T',
      franchiseKey: 'tmdb-col:1',
      franchiseName: 'X',
      metaFailedAt: new Date(),
      createdAt: new Date(0),
    });
    expect(out).toEqual({ externalId: '550', title: 'T' });
  });
});

describe('fillOnlyUpdate', () => {
  const stored = {
    id: 'm1',
    externalId: '550',
    title: 'Fight Club',
    imageUrl: 'https://img/fc.jpg',
    description: null,
    runtime: null,
    genres: [] as string[],
    tmdbRating: 8.4,
    franchiseName: null,
  };

  it('never overwrites stored values', () => {
    expect(
      fillOnlyUpdate(stored, { title: 'Renamed', imageUrl: 'https://evil/x.jpg', tmdbRating: 1 }),
    ).toEqual({});
  });

  it('fills only empty columns with non-empty values', () => {
    expect(
      fillOnlyUpdate(stored, { description: 'Soap.', runtime: 139, genres: ['Drama'], title: 'X' }),
    ).toEqual({ description: 'Soap.', runtime: 139, genres: ['Drama'] });
    expect(fillOnlyUpdate(stored, { description: '  ', runtime: null, genres: [] })).toEqual({});
  });

  it('never touches identity or grouping, even when empty, nor unknown columns', () => {
    expect(
      fillOnlyUpdate(stored, { externalId: 'manual:x', id: 'z', franchiseName: 'Mine', bogus: 1 }),
    ).toEqual({});
  });
});
