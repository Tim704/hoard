import { describe, expect, it } from 'vitest';

import { TILE_IDS, type TileId } from './dashboard-tile-ids';
import {
  TILE_LABELS,
  dataNeeds,
  isDefaultOrder,
  knownTileIds,
  moveTile,
  normalizeOrder,
  placeListed,
  resolveTiles,
  tileSection,
} from './dashboard-tiles';

const NONE = { order: [], hidden: [] };

describe('normalizeOrder', () => {
  it('gives the default order for an empty saved order', () => {
    expect(normalizeOrder([])).toEqual([...TILE_IDS]);
  });

  it('returns a copy, never TILE_IDS itself', () => {
    const order = normalizeOrder([]);
    order.reverse();
    expect(TILE_IDS[0]).toBe('recommend');
  });

  it('drops unknown and duplicate ids', () => {
    const saved = ['coming-up', 'nope', 'coming-up', 'cat:books', 42 as unknown as string, 'cat:books'];
    const order = normalizeOrder(saved);
    expect(order).toHaveLength(TILE_IDS.length);
    expect(new Set(order).size).toBe(TILE_IDS.length);
    expect(order).not.toContain('nope');
    // The saved ones keep their saved order, ahead of their default successors.
    expect(order.indexOf('coming-up')).toBeLessThan(order.indexOf('cat:books'));
  });

  it('inserts a missing id right after its nearest earlier default tile', () => {
    const withoutGoals = TILE_IDS.filter((id) => id !== 'goals');
    const order = normalizeOrder(withoutGoals);
    expect(order).toEqual([...TILE_IDS]);
    expect(order[order.indexOf('coming-up') + 1]).toBe('goals');
  });

  it('follows a moved predecessor', () => {
    // coming-up moved to the front; goals (missing) goes right after it.
    const saved = ['coming-up', ...TILE_IDS.filter((id) => id !== 'coming-up' && id !== 'goals')];
    const order = normalizeOrder(saved);
    expect(order.slice(0, 2)).toEqual(['coming-up', 'goals']);
  });

  it('chains several missing ids in default order', () => {
    const saved = TILE_IDS.filter((id) => id !== 'goals' && id !== 'favourites');
    expect(normalizeOrder(saved)).toEqual([...TILE_IDS]);
  });

  it('puts a missing id first when no earlier default tile is present', () => {
    // recommend has no predecessor: it goes first.
    const saved = TILE_IDS.filter((id) => id !== 'recommend').reverse();
    const order = normalizeOrder(saved);
    expect(order[0]).toBe('recommend');
    expect(order.slice(1)).toEqual(saved);
  });
});

describe('resolveTiles', () => {
  it('shows every tile in the default order by default', () => {
    expect(resolveTiles(NONE, [])).toEqual([...TILE_IDS]);
  });

  it('leaves out hidden tiles', () => {
    const tiles = resolveTiles({ order: [], hidden: ['overview', 'goals'] }, []);
    expect(tiles).not.toContain('overview');
    expect(tiles).not.toContain('goals');
    expect(tiles).toHaveLength(TILE_IDS.length - 2);
  });

  it('leaves out the tiles of sections hidden in Settings', () => {
    const tiles = resolveTiles(NONE, ['tv', 'music', 'franchises']);
    expect(tiles).not.toContain('cat:tv');
    expect(tiles).not.toContain('cat:music');
    expect(tiles).toHaveLength(TILE_IDS.length - 2);
  });

  it('ignores unknown hidden ids', () => {
    expect(resolveTiles({ order: [], hidden: ['nope'] }, [])).toEqual([...TILE_IDS]);
  });

  it('keeps recommend first even when it was saved last', () => {
    const saved = [...TILE_IDS.filter((id) => id !== 'recommend'), 'recommend'];
    const tiles = resolveTiles({ order: saved, hidden: [] }, []);
    expect(tiles[0]).toBe('recommend');
    expect(tiles.slice(1)).toEqual(saved.slice(0, -1));
  });

  it('can show nothing at all', () => {
    expect(resolveTiles({ order: [], hidden: [...TILE_IDS] }, [])).toEqual([]);
  });
});

describe('isDefaultOrder', () => {
  it('is true for an empty or the full default order', () => {
    expect(isDefaultOrder([])).toBe(true);
    expect(isDefaultOrder([...TILE_IDS])).toBe(true);
  });

  it('is true for a default order with gaps or junk', () => {
    expect(isDefaultOrder(['recommend', 'cat:books', 'nope', 'cat:books'])).toBe(true);
  });

  it('is false for any other order', () => {
    // A lone tile takes the rest around it in default order: still the default.
    expect(isDefaultOrder(['coming-up'])).toBe(true);
    expect(isDefaultOrder(['coming-up', 'cat:books'])).toBe(false);
    expect(isDefaultOrder([...TILE_IDS].reverse())).toBe(false);
  });
});

describe('dataNeeds', () => {
  const none = { stats: false, nowConsuming: false, favourites: false, comingUp: false, goals: false };

  it('loads only Coming up for Coming up alone', () => {
    expect(dataNeeds(['coming-up'])).toEqual({ ...none, comingUp: true });
  });

  it('loads only the stats for a section tile alone', () => {
    expect(dataNeeds(['cat:books'])).toEqual({ ...none, stats: true });
  });

  it('loads nothing for no tiles (or Recommend alone)', () => {
    expect(dataNeeds([])).toEqual(none);
    expect(dataNeeds(['recommend'])).toEqual(none);
  });

  it('loads the stats for the overview, and everything for every tile', () => {
    expect(dataNeeds(['overview']).stats).toBe(true);
    expect(dataNeeds([...TILE_IDS])).toEqual({ stats: true, nowConsuming: true, favourites: true, comingUp: true, goals: true });
  });
});

describe('moveTile', () => {
  const all = [...TILE_IDS];
  const listed = (hidden: TileId[]) => all.filter((id) => !hidden.includes(id));

  it('swaps a tile with its listed neighbour', () => {
    const up = moveTile(all, 'coming-up', 'up', all);
    expect(up.slice(9, 11)).toEqual(['coming-up', 'now-consuming']);
    const down = moveTile(all, 'coming-up', 'down', all);
    expect(down.slice(10, 12)).toEqual(['goals', 'coming-up']);
  });

  it('skips a tile that is not listed, which keeps its place', () => {
    // TV is hidden in Settings: Manga moves up past it, onto the overview's place.
    const next = moveTile(all, 'cat:manga', 'up', listed(['cat:tv']));
    expect(next.indexOf('cat:tv')).toBe(all.indexOf('cat:tv'));
    expect(next.slice(4, 8)).toEqual(['cat:games', 'cat:manga', 'cat:tv', 'overview']);
    // And back down again.
    expect(moveTile(next, 'cat:manga', 'down', listed(['cat:tv']))).toEqual(all);
  });

  it('does nothing at either end or for a tile that is not listed', () => {
    const shown = listed(['recommend']);
    expect(moveTile(all, 'cat:books', 'up', shown)).toEqual(all);
    expect(moveTile(all, 'favourites', 'down', shown)).toEqual(all);
    expect(moveTile(all, 'recommend', 'down', shown)).toEqual(all);
  });
});

describe('placeListed', () => {
  it('puts the listed tiles in the given order around the unlisted ones', () => {
    const order: TileId[] = ['cat:books', 'cat:tv', 'overview', 'goals'];
    expect(placeListed(order, ['goals', 'overview', 'cat:books'])).toEqual(['goals', 'cat:tv', 'overview', 'cat:books']);
  });
});

describe('labels and helpers', () => {
  it('names every tile, the sections by their section names', () => {
    for (const id of TILE_IDS) expect(TILE_LABELS[id]).toBeTruthy();
    expect(TILE_LABELS['cat:games']).toBe('Video Games');
    expect(TILE_LABELS.recommend).toBe('Recommend across media');
    expect(TILE_LABELS.favourites).toBe('Favourites');
  });

  it('finds a section tile’s section', () => {
    expect(tileSection('cat:tv')).toBe('tv');
    expect(tileSection('overview')).toBeNull();
  });

  it('keeps known ids once each, in their order', () => {
    expect(knownTileIds(['goals', 'x', 'goals', 'overview'])).toEqual(['goals', 'overview']);
  });
});
