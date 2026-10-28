import { describe, expect, it } from 'vitest';

import tmdbTvDetails from './apis/__fixtures__/tmdb-tv-details.json';
import { splitSeasons, SEASONS_KEY } from './apis/details';
import { mapTvSeasons } from './apis/tmdb';
import {
  applySeasonChange,
  buildSeasonBoard,
  isSeasonRankable,
  MAX_EPISODES,
  normalizeEpisodeTicks,
  parseSeasonChange,
  hasWatchState,
  prefillSeasons,
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

  it('clamps counts and ticks to a season TMDB has shrunk', () => {
    expect(watchedOf({ watchedEpisodes: 12, episodesWatched: [], episodeCount: 10 })).toBe(10);
    expect(watchedOf({ watchedEpisodes: 3, episodesWatched: [1, 9, 11], episodeCount: 10 })).toBe(2);
    expect(watchedOf({ watchedEpisodes: 12, episodesWatched: [], episodeCount: null })).toBe(12);
    expect(
      seasonProgress([
        { watchedEpisodes: 12, episodesWatched: [], episodeCount: 10 },
        { watchedEpisodes: 0, episodesWatched: [1, 2, 9], episodeCount: 8 },
      ]),
    ).toBe(12);
  });

  it('a season with only a score is not watch tracking: rate S1, then +1 on S2 continues 30 → 31', () => {
    const seasons = [
      { id: 's1', seasonNumber: 1, episodeCount: 10 },
      { id: 's2', seasonNumber: 2, episodeCount: 24 },
      { id: 's3', seasonNumber: 3, episodeCount: 13 },
    ];
    type Stored = { watchedEpisodes: number; episodesWatched: number[]; rating: number | null };
    // Scoring S1 first stored a row with a rating and no watch state.
    const stored = new Map<string, Stored>([['s1', { watchedEpisodes: 0, episodesWatched: [], rating: 8 }]]);
    expect(hasWatchState([...stored.values()])).toBe(false);
    expect(hasWatchState([{ watchedEpisodes: 0, episodesWatched: [2] }])).toBe(true);
    expect(hasWatchState([{ watchedEpisodes: 1, episodesWatched: [] }])).toBe(true);
    expect(hasWatchState([])).toBe(false);

    // The prefill sets the watch counts (upsert) and keeps the score…
    for (const [id, n] of prefillSeasons(seasons, 30)) {
      const row = stored.get(id) ?? { watchedEpisodes: 0, episodesWatched: [], rating: null };
      stored.set(id, { ...row, watchedEpisodes: n, episodesWatched: [] });
    }
    // …then +1 on S2 lands on top.
    const s2 = stored.get('s2')!;
    stored.set('s2', { ...s2, ...applySeasonChange(s2, { kind: 'inc' }, 24)! });
    expect(stored.get('s2')?.watchedEpisodes).toBe(21);
    expect(seasonProgress([...stored.values()])).toBe(31);
    expect(stored.get('s1')).toEqual({ watchedEpisodes: 10, episodesWatched: [], rating: 8 });
  });

  it('prefills seasons in order from existing progress', () => {
    const seasons = [
      { id: 's2', seasonNumber: 2, episodeCount: 13 },
      { id: 's1', seasonNumber: 1, episodeCount: 10 },
      { id: 's3', seasonNumber: 3, episodeCount: 13 },
    ];
    expect([...prefillSeasons(seasons, 30)]).toEqual([['s1', 10], ['s2', 13], ['s3', 7]]);
    expect([...prefillSeasons(seasons, 4)]).toEqual([['s1', 4]]);
    expect([...prefillSeasons(seasons, 99)]).toEqual([['s1', 10], ['s2', 13], ['s3', 13]]);
    expect(prefillSeasons(seasons, 0).size).toBe(0);
    expect(prefillSeasons(seasons, null).size).toBe(0);
    // An unknown count takes the rest.
    expect([...prefillSeasons([{ id: 'a', seasonNumber: 1, episodeCount: 2 }, { id: 'b', seasonNumber: 2, episodeCount: null }], 30)]).toEqual([
      ['a', 2],
      ['b', 28],
    ]);
    // Then the first change lands on top: 30 → 31.
    const filled = prefillSeasons(seasons, 30);
    const s3 = applySeasonChange({ watchedEpisodes: filled.get('s3') ?? 0, episodesWatched: [] }, { kind: 'inc' }, 13)!;
    expect(10 + 13 + s3.watchedEpisodes).toBe(31);
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
    expect(parseSeasonChange({ kind: 'ticks', episodes: Array.from({ length: MAX_EPISODES + 1 }, (_, i) => i + 1) })).toBeNull();
    expect(parseSeasonChange({ kind: 'ticks', episodes: Array.from({ length: MAX_EPISODES }, (_, i) => i + 1) })).not.toBeNull();
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
