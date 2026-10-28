import { describe, expect, it } from 'vitest';

import { upsertUpdatePayload } from './media-upsert';

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
