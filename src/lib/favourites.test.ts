import { describe, expect, it } from 'vitest';

import { favouritesShowcase } from './favourites';
import { makeActivity } from './test-fixtures';

describe('favouritesShowcase', () => {
  const fav = (o: Parameters<typeof makeActivity>[0]) => makeActivity({ favorite: true, ...o });

  it('orders by the tier list, then untiered titles by score', () => {
    const list = [
      fav({ id: 'untiered-9', rating: 9 }),
      fav({ id: 'b', tier: 'B', rankOrder: 1000, rating: 10 }),
      fav({ id: 's2', tier: 'S', rankOrder: 2000 }),
      fav({ id: 's1', tier: 'S', rankOrder: 1000 }),
      fav({ id: 'unscored' }),
      fav({ id: 'untiered-7', rating: 7 }),
    ];
    const [movies] = favouritesShowcase(list);
    expect(movies.slug).toBe('movies');
    expect(movies.items.map((a) => a.id)).toEqual(['s1', 's2', 'b', 'untiered-9']);
  });

  it('ignores a tier on a title that is not finished', () => {
    const list = [
      fav({ id: 'planned-tier', status: 'PLANNED', tier: 'S', rating: 5 }),
      fav({ id: 'scored', rating: 6 }),
    ];
    expect(favouritesShowcase(list)[0].items.map((a) => a.id)).toEqual(['scored', 'planned-tier']);
  });

  it('only shows favourites, per section in navigation order, skipping hidden sections', () => {
    const list = [
      fav({ id: 'game', category: 'games' }),
      makeActivity({ id: 'not-fav', category: 'books', rating: 10 }),
      fav({ id: 'book', category: 'books' }),
      fav({ id: 'tv', category: 'tv' }),
    ];
    expect(favouritesShowcase(list).map((s) => s.slug)).toEqual(['books', 'games', 'tv']);
    expect(favouritesShowcase(list, ['tv']).map((s) => s.slug)).toEqual(['books', 'games']);
    expect(favouritesShowcase([makeActivity({ id: 'x' })])).toEqual([]);
  });
});
