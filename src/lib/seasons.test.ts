import { describe, expect, it } from 'vitest';

import tmdbTvDetails from './apis/__fixtures__/tmdb-tv-details.json';
import { splitSeasons, SEASONS_KEY } from './apis/details';
import { mapTvSeasons } from './apis/tmdb';
import {
  applySeasonChange,
  buildSeasonBoard,
  isSeasonRankable,
  normalizeEpisodeTicks,
  parseSeasonChange,
  pickSeasonMatchup,
  seasonProgress,
  watchedOf,
  type SeasonItem,
} from './seasons';
import {
  acceptSuggestions,
  boardPlacement,
  compareTierOrder,
  findContainer,
  moveItem,
  withinTierPairs,
} from './tiers';

const season = (o: Partial<SeasonItem> & { id: string }): SeasonItem => ({
  seasonId: `s-${o.id}`,
  seasonNumber: 1,
  title: `Season ${o.id}`,
  imageUrl: null,
  airDate: null,
  episodeCount: 10,
  watchedEpisodes: 1,
  rating: null,
  tier: null,
  rankOrder: null,
  elo: 1200,
  duels: 0,
  ...o,
});

describe('TMDB season mapper', () => {
  it('maps seasons[], skipping the specials and malformed entries', () => {
    expect(mapTvSeasons(tmdbTvDetails)).toEqual([
      {
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: 10,
        airDate: '2011-04-17',
        imageUrl: 'https://image.tmdb.org/t/p/w500/wgfKiqzuMrFIkU1M68DDDY8kGC1.jpg',
      },
      { seasonNumber: 2, name: 'Season 2', episodeCount: 10, airDate: '2012-04-01', imageUrl: null },
      { seasonNumber: 3, name: 'Season 3', episodeCount: null, airDate: null, imageUrl: null },
    ]);
    expect(mapTvSeasons({})).toEqual([]);
  });

  it('splits a TV patch into columns and seasons', () => {
    const seasons = mapTvSeasons(tmdbTvDetails);
    expect(splitSeasons({ status: 'Ended', [SEASONS_KEY]: seasons })).toEqual({
      columns: { status: 'Ended' },
      seasons,
    });
    expect(splitSeasons({ status: 'Ended' })).toEqual({ columns: { status: 'Ended' }, seasons: null });
  });
});

describe('season progress', () => {
  it('normalises episode ticks: sorted, unique, integers in range', () => {
    expect(normalizeEpisodeTicks([3, 1, 3, 2, 0, -1, 1.5, '4', 11, 10], 10)).toEqual([1, 2, 3, 10]);
    expect(normalizeEpisodeTicks([40, 2], null)).toEqual([2, 40]);
    expect(normalizeEpisodeTicks([1000], null)).toEqual([]);
    expect(normalizeEpisodeTicks('1,2', 10)).toEqual([]);
  });

  it('counts ticks when used, else the count field', () => {
    expect(watchedOf({ watchedEpisodes: 4, episodesWatched: [] })).toBe(4);
    expect(watchedOf({ watchedEpisodes: 9, episodesWatched: [1, 5] })).toBe(2);
    expect(watchedOf({ watchedEpisodes: -3, episodesWatched: [] })).toBe(0);
  });

  it('sums watched episodes over the seasons', () => {
    expect(
      seasonProgress([
        { watchedEpisodes: 10, episodesWatched: [] },
        { watchedEpisodes: 0, episodesWatched: [1, 2, 4] },
        { watchedEpisodes: 0, episodesWatched: [] },
      ]),
    ).toBe(13);
    expect(seasonProgress([])).toBe(0);
  });

  it('applies +1, set and all in count mode, clamped to the episode count', () => {
    const none = { watchedEpisodes: 0, episodesWatched: [] };
    expect(applySeasonChange(none, { kind: 'inc' }, 10)).toEqual({ watchedEpisodes: 1, episodesWatched: [] });
    expect(applySeasonChange({ watchedEpisodes: 10, episodesWatched: [] }, { kind: 'inc' }, 10)?.watchedEpisodes).toBe(10);
    expect(applySeasonChange(none, { kind: 'set', value: 42 }, 10)?.watchedEpisodes).toBe(10);
    expect(applySeasonChange(none, { kind: 'set', value: -2 }, 10)?.watchedEpisodes).toBe(0);
    expect(applySeasonChange(none, { kind: 'set', value: 3.7 }, 10)?.watchedEpisodes).toBe(3);
    expect(applySeasonChange(none, { kind: 'all' }, 8)).toEqual({ watchedEpisodes: 8, episodesWatched: [] });
    expect(applySeasonChange(none, { kind: 'all' }, null)).toBeNull();
  });

  it('keeps ticks the truth once used', () => {
    const ticked = { watchedEpisodes: 2, episodesWatched: [1, 3] };
    expect(applySeasonChange(ticked, { kind: 'inc' }, 4)).toEqual({ watchedEpisodes: 3, episodesWatched: [1, 2, 3] });
    expect(applySeasonChange(ticked, { kind: 'set', value: 2 }, 4)).toEqual({ watchedEpisodes: 2, episodesWatched: [1, 2] });
    expect(applySeasonChange(ticked, { kind: 'all' }, 4)).toEqual({ watchedEpisodes: 4, episodesWatched: [1, 2, 3, 4] });
    expect(applySeasonChange(ticked, { kind: 'ticks', episodes: [4, 2, 2, 9] }, 4)).toEqual({
      watchedEpisodes: 2,
      episodesWatched: [2, 4],
    });
    // Unticking everything goes back to count mode at 0.
    expect(applySeasonChange(ticked, { kind: 'ticks', episodes: [] }, 4)).toEqual({ watchedEpisodes: 0, episodesWatched: [] });
  });

  it('parses untrusted changes', () => {
    expect(parseSeasonChange({ kind: 'inc' })).toEqual({ kind: 'inc' });
    expect(parseSeasonChange({ kind: 'set', value: 3 })).toEqual({ kind: 'set', value: 3 });
    expect(parseSeasonChange({ kind: 'set', value: '3' })).toBeNull();
    expect(parseSeasonChange({ kind: 'ticks', episodes: [1] })).toEqual({ kind: 'ticks', episodes: [1] });
    expect(parseSeasonChange({ kind: 'ticks' })).toBeNull();
    expect(parseSeasonChange({ kind: 'nope' })).toBeNull();
    expect(parseSeasonChange(null)).toBeNull();
  });
});

describe('generic tier rules with seasons', () => {
  const items = [
    season({ id: 'a', tier: 'A', rankOrder: 2000 }),
    season({ id: 'b', tier: 'A', rankOrder: 1000 }),
    season({ id: 'c', tier: null, rating: 9 }),
    season({ id: 'd', tier: null, rating: 4, watchedEpisodes: 0 }),
    season({ id: 'e', watchedEpisodes: 0 }), // unwatched, unscored → not on the board
  ];
  const board = buildSeasonBoard(items);

  it('only watched or scored seasons are on the board', () => {
    expect(isSeasonRankable({ watchedEpisodes: 0, rating: null })).toBe(false);
    expect(isSeasonRankable({ watchedEpisodes: 0, rating: 5 })).toBe(true);
    expect(board.tiers.A.map((s) => s.id)).toEqual(['b', 'a']);
    expect(board.tray.map((s) => s.id)).toEqual(['c', 'd']);
    expect(findContainer(board, 'e')).toBeNull();
  });

  it('orders by title when everything else ties', () => {
    const ties = [season({ id: 'y', title: 'Season 2' }), season({ id: 'x', title: 'Season 1' })];
    expect([...ties].sort(compareTierOrder).map((s) => s.id)).toEqual(['x', 'y']);
  });

  it('moves, places and suggests like activities', () => {
    const next = moveItem(board, 'c', 'S');
    expect(boardPlacement(next)).toEqual({ S: ['c'], A: ['b', 'a'], B: [], C: [], D: [], F: [] });
    expect(next.tray.map((s) => s.id)).toEqual(['d']);
    const p = acceptSuggestions(board);
    expect(p.S).toEqual(['c']);
    expect(p.F).toEqual(['d']);
    expect(withinTierPairs(board).map(([p1, q]) => [p1.id, q.id])).toEqual([['b', 'a']]);
  });
});

describe('season matchups', () => {
  it('prefers neighbours inside a tier', () => {
    const m = pickSeasonMatchup([
      season({ id: 'a', tier: 'B', rankOrder: 1000 }),
      season({ id: 'b', tier: 'B', rankOrder: 2000 }),
      season({ id: 'c', rating: 7 }),
      season({ id: 'd', rating: 7.5 }),
    ]);
    expect([m?.a.id, m?.b.id]).toEqual(['a', 'b']);
    expect(m?.rating).toBeNull();
  });

  it('picks the pair with the fewest duels', () => {
    const items = [
      season({ id: 'a', tier: 'S', rankOrder: 1000, duels: 5 }),
      season({ id: 'b', tier: 'S', rankOrder: 2000, duels: 5 }),
      season({ id: 'c', tier: 'S', rankOrder: 3000, duels: 0 }),
    ];
    const m = pickSeasonMatchup(items, () => 0);
    expect([m?.a.id, m?.b.id]).toEqual(['b', 'c']);
  });

  it('falls back to the same whole score, else none', () => {
    const m = pickSeasonMatchup([
      season({ id: 'a', rating: 7.2 }),
      season({ id: 'b', rating: 8 }),
      season({ id: 'c', rating: 7.9 }),
    ]);
    expect([m?.a.id, m?.b.id].sort()).toEqual(['a', 'c']);
    expect(m?.rating).toBe(7);
    expect(pickSeasonMatchup([season({ id: 'a', rating: 7 }), season({ id: 'b', rating: 8 })])).toBeNull();
    // Unwatched, unscored seasons never duel.
    expect(pickSeasonMatchup([season({ id: 'a', watchedEpisodes: 0 }), season({ id: 'b', watchedEpisodes: 0 })])).toBeNull();
  });
});
