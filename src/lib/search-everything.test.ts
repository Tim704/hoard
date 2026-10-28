import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CategorySlug } from './categories';
import { searchSections, SECTION_RESULT_CAP } from './search-everything';
import type { NormalizedResult, SearchResponse } from './types';

const hit = (id: string): NormalizedResult => ({ externalId: id, title: id, imageUrl: null, subtitle: null, year: null, description: null, fields: {} });

describe('searchSections', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs every section in parallel and reports results, errors and timeouts per section', async () => {
    const started: CategorySlug[] = [];
    const search = (slug: CategorySlug): Promise<SearchResponse> => {
      started.push(slug);
      if (slug === 'books') return Promise.resolve({ source: 'OpenLibrary', results: Array.from({ length: 20 }, (_, i) => hit(`b${i}`)) });
      if (slug === 'movies') return Promise.resolve({ source: 'TMDB', results: [], error: 'TMDB_API_KEY not configured' });
      if (slug === 'anime') return Promise.reject(new Error('boom'));
      return new Promise(() => {}); // games: never answers
    };
    // Fake timers: the stuck section times out after exactly its 50 ms budget
    // (no wall-clock assertion, which flaked on a busy machine).
    vi.useFakeTimers();
    const pending = searchSections(['books', 'movies', 'anime', 'games'], 'dune', search, 50);
    await vi.advanceTimersByTimeAsync(50);
    const out = await pending;
    expect(started).toEqual(['books', 'movies', 'anime', 'games']);
    expect(out.map((o) => [o.slug, o.state])).toEqual([
      ['books', 'ok'],
      ['movies', 'error'],
      ['anime', 'error'],
      ['games', 'timeout'],
    ]);
    expect(out[0].state === 'ok' && out[0].results).toHaveLength(SECTION_RESULT_CAP);
    expect(out[1]).toMatchObject({ message: 'TMDB_API_KEY not configured' });
  });
});
