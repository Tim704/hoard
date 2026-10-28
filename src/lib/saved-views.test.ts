import { describe, expect, it } from 'vitest';

import { applyView, cleanViewName, EMPTY_VIEW, isEmptyView, matchesView, parseViewQuery } from './saved-views';
import { makeActivity } from './test-fixtures';
import type { ActivityWithMedia } from './types';

const a = (id: string, over: Omit<Partial<ActivityWithMedia>, 'media'> & { media?: Record<string, unknown> } = {}) => {
  const { media, ...rest } = over;
  const base = makeActivity({ id, ...rest });
  return { ...base, media: { ...base.media, ...(media ?? {}) } } as ActivityWithMedia;
};

const library = [
  a('alien', { category: 'movies', rating: 8.8, tier: 'S', rankOrder: 1, tags: ['Sci-fi'], createdAt: '2026-01-03T00:00:00Z', media: { year: 1979, runtime: 117, genres: ['Horror', 'Science Fiction'] } }),
  a('heat', { category: 'movies', rating: 8.1, tier: 'A', rankOrder: 1, createdAt: '2026-01-02T00:00:00Z', media: { year: 1995, runtime: 170, genres: ['Crime'] } }),
  a('dune', { category: 'books', rating: 9.2, tier: 'S', rankOrder: 2, tags: ['sci-fi', 'Classic'], createdAt: '2026-01-05T00:00:00Z', media: { year: 1965, pageCount: 600, releaseDate: '1965-08-01' } }),
  a('frieren', { category: 'anime', status: 'CONSUMING', createdAt: '2026-01-04T00:00:00Z', media: { year: 2023, genres: ['Fantasy'] } }),
  a('planned', { category: 'movies', status: 'PLANNED', tier: 'S', rankOrder: 0, createdAt: '2026-01-01T00:00:00Z', media: { year: null } }),
];
const ids = (list: ActivityWithMedia[]) => list.map((x) => x.id);

describe('parseViewQuery', () => {
  it('drops unknown keys and bad values, bounds arrays and swaps reversed ranges', () => {
    const q = parseViewQuery({
      sections: ['movies', 'nope', 'movies', 'books'],
      statuses: ['COMPLETED', 'WAT'],
      tags: ['  Sci-fi ', 'sci-fi', 3],
      genres: Array.from({ length: 40 }, (_, i) => `G${i}`),
      maxMinutes: 120.4,
      scoreMin: 9,
      scoreMax: 7,
      yearMin: 'x',
      yearMax: 99999,
      sort: 'evil',
      __proto__x: 1,
      extra: 'gone',
    });
    expect(q).toEqual({
      sections: ['movies', 'books'],
      statuses: ['COMPLETED'],
      tags: ['Sci-fi'],
      genres: Array.from({ length: 20 }, (_, i) => `G${i}`),
      maxMinutes: 120,
      scoreMin: 7,
      scoreMax: 9,
      yearMin: null,
      yearMax: null,
      sort: 'recent',
    });
  });

  it('turns garbage into the empty view', () => {
    expect(parseViewQuery(null)).toEqual(EMPTY_VIEW);
    expect(parseViewQuery('x')).toEqual(EMPTY_VIEW);
    expect(parseViewQuery([1])).toEqual(EMPTY_VIEW);
    expect(isEmptyView(EMPTY_VIEW)).toBe(true);
    expect(isEmptyView(parseViewQuery({ sort: 'title' }))).toBe(true);
    expect(isEmptyView(parseViewQuery({ scoreMin: 5 }))).toBe(false);
  });

  it('cleans names to 60 characters', () => {
    expect(cleanViewName('  Short   films ')).toBe('Short films');
    expect(cleanViewName('   ')).toBeNull();
    expect(cleanViewName(5)).toBeNull();
    expect(cleanViewName('x'.repeat(80))).toHaveLength(60);
  });
});

describe('applyView', () => {
  it('filters by section, status, tags (all) and genres (any)', () => {
    expect(ids(applyView(library, parseViewQuery({ sections: ['movies'], statuses: ['COMPLETED'] })))).toEqual(['alien', 'heat']);
    expect(ids(applyView(library, parseViewQuery({ tags: ['SCI-FI'] })))).toEqual(['dune', 'alien']);
    expect(ids(applyView(library, parseViewQuery({ tags: ['sci-fi', 'classic'] })))).toEqual(['dune']);
    expect(ids(applyView(library, parseViewQuery({ genres: ['crime', 'fantasy'] })))).toEqual(['frieren', 'heat']);
  });

  it('keeps titles within the length limit, leaving unknown lengths out', () => {
    // Alien 117 min, Heat 170, Dune 600 pages = 900 min, Frieren 24 min an episode, planned: no runtime.
    expect(ids(applyView(library, parseViewQuery({ maxMinutes: 120 })))).toEqual(['frieren', 'alien']);
  });

  it('applies inclusive score and year ranges, excluding unknowns', () => {
    expect(ids(applyView(library, parseViewQuery({ scoreMin: 8.8 })))).toEqual(['dune', 'alien']);
    expect(ids(applyView(library, parseViewQuery({ scoreMax: 8.1 })))).toEqual(['heat']);
    expect(ids(applyView(library, parseViewQuery({ yearMin: 1979, yearMax: 1995 })))).toEqual(['alien', 'heat']);
    expect(matchesView(library[4], parseViewQuery({ yearMax: 2000 }))).toBe(false);
  });

  it('sorts by recent, score, title, release and tier', () => {
    const sorted = (sort: string) => ids(applyView(library, parseViewQuery({ sort })));
    expect(sorted('recent')).toEqual(['dune', 'frieren', 'alien', 'heat', 'planned']);
    expect(sorted('score')).toEqual(['dune', 'alien', 'heat', 'frieren', 'planned']);
    expect(sorted('title')).toEqual(['alien', 'dune', 'frieren', 'heat', 'planned']);
    expect(sorted('release')).toEqual(['frieren', 'heat', 'alien', 'dune', 'planned']);
    // A Planned title's tier doesn't count: it isn't on the tier list.
    expect(sorted('tier').slice(0, 3)).toEqual(['alien', 'dune', 'heat']);
    expect(sorted('tier').slice(3).sort()).toEqual(['frieren', 'planned']);
  });

  it('uses the shown title for the title sort', () => {
    const titled = applyView(library, parseViewQuery({ sort: 'title' }), (x) => (x.id === 'heat' ? 'AAA' : x.media.title));
    expect(ids(titled)[0]).toBe('heat');
  });
});
