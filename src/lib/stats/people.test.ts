import { describe, expect, it } from 'vitest';

import { statTitle } from './fixtures';
import { topPeople } from './people';

describe('topPeople', () => {
  const villeneuve = (title: string, rating: number | null, extra: Partial<Parameters<typeof statTitle>[0]> = {}) =>
    statTitle({ rating, ...extra, media: { title, directors: ['Denis Villeneuve'], cast: ['Amy Adams', ' Amy Adams'] } });

  it('counts finished movies and TV per person with the average score', () => {
    const list = [
      villeneuve('Arrival', 9),
      villeneuve('Sicario', 7),
      villeneuve('Dune', null, { status: 'PLANNED' }), // not finished
      statTitle({ category: 'tv', rating: 8, media: { title: 'Chernobyl', directors: ['Craig Mazin'] } }),
      statTitle({ category: 'books', media: { directors: ['Nobody'] } }), // not movies/TV
    ];
    const rows = topPeople(list, 'directors');
    expect(rows.map((r) => r.name)).toEqual(['Denis Villeneuve', 'Craig Mazin']);
    expect(rows[0]).toMatchObject({ count: 2, avgScore: 8, titles: ['Arrival', 'Sicario'] });
  });

  it('counts a person once per title, even if listed twice', () => {
    expect(topPeople([villeneuve('Arrival', 9)], 'cast')[0]).toMatchObject({ name: 'Amy Adams', count: 1 });
  });

  it('ties go to the higher average, then the name; capped at n', () => {
    const list = [
      statTitle({ rating: 5, media: { cast: ['B'] } }),
      statTitle({ rating: 9, media: { cast: ['C'] } }),
      statTitle({ rating: 5, media: { cast: ['A'] } }),
    ];
    expect(topPeople(list, 'cast').map((r) => r.name)).toEqual(['C', 'A', 'B']);
    expect(topPeople(list, 'cast', 1)).toHaveLength(1);
  });
});
