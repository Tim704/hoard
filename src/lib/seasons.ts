// ───────────────────────────────────────────────────────────────────────────
//  TV season tracking rules (3.3 / 4.5) — pure, shared by the server actions,
//  the data fetchers and the details' Seasons section.
//
//  A season's watched episodes are either a plain count or, once the user
//  ticks individual episodes, the ticked episode numbers (`episodesWatched`,
//  sorted and unique; `watchedEpisodes` then equals their count). The show's
//  `progress` is the sum over its seasons.
// ───────────────────────────────────────────────────────────────────────────

import { buildItemBoard, TIERS, withinTierPairs, type Tier, type TierBoardData } from '@/lib/tiers';

/** The stored watch state of one season. */
export interface SeasonWatch {
  watchedEpisodes: number;
  episodesWatched: number[];
}

/** Upper bound for an episode number / count when TMDB doesn't know it. */
export const MAX_EPISODES = 999;

const limitOf = (episodeCount: number | null) =>
  episodeCount != null && episodeCount > 0 ? Math.min(episodeCount, MAX_EPISODES) : MAX_EPISODES;

/**
 * Untrusted ticks → sorted unique integers in 1…episodeCount (or 1…999 when
 * the count is unknown). Anything else is dropped.
 */
export function normalizeEpisodeTicks(input: unknown, episodeCount: number | null): number[] {
  if (!Array.isArray(input)) return [];
  const max = limitOf(episodeCount);
  const set = new Set<number>();
  for (const v of input) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

/** A season's watch state with its (current) TMDB episode count, when known. */
export type CountedWatch = SeasonWatch & { episodeCount?: number | null };

/**
 * Watched episodes of a season: the tick count when ticks are used, else the
 * count. Clamped to the episode count when known, so a season TMDB later
 * shrinks never counts episodes it no longer has.
 */
export function watchedOf(s: CountedWatch): number {
  const max = s.episodeCount != null && s.episodeCount >= 0 ? s.episodeCount : Infinity;
  if (s.episodesWatched.length > 0) return s.episodesWatched.filter((n) => n <= max).length;
  return Math.max(0, Math.min(s.watchedEpisodes, max));
}

/** The show's progress: watched episodes summed over its seasons. */
export function seasonProgress(seasons: CountedWatch[]): number {
  return seasons.reduce((n, s) => n + watchedOf(s), 0);
}

/**
 * Whether any season of a show has watch state (a count or ticks). Rows that
 * only hold a score or a tier don't count: the show is still "untracked" and
 * its first watch change starts from the stored progress.
 */
export function hasWatchState(rows: SeasonWatch[]): boolean {
  return rows.some((r) => r.watchedEpisodes > 0 || r.episodesWatched.length > 0);
}

/**
 * The first season interaction on a show that already has progress: spread
 * that progress over the seasons in order (each filled up to its episode
 * count; a season with an unknown count takes the rest), so the season sum
 * starts where the progress was. Returns seasonId → watched count (zeros
 * left out). Anything beyond the last season's count is dropped.
 */
export function prefillSeasons(
  seasons: { id: string; seasonNumber: number; episodeCount: number | null }[],
  progress: number | null,
): Map<string, number> {
  const out = new Map<string, number>();
  let left = progress != null && progress > 0 ? Math.trunc(progress) : 0;
  for (const s of [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber)) {
    if (left <= 0) break;
    const take = Math.min(left, s.episodeCount != null ? s.episodeCount : MAX_EPISODES);
    if (take > 0) out.set(s.id, take);
    left -= take;
  }
  return out;
}

/** A change from the Seasons section. */
export type SeasonChange =
  | { kind: 'inc' }
  | { kind: 'set'; value: number }
  | { kind: 'all' }
  | { kind: 'ticks'; episodes: number[] };

/** 1…n */
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/**
 * Apply a change to a season's watch state. In tick mode (any ticks stored),
 * +1 ticks the first unticked episode and "set"/"all" tick 1…n, so the ticks
 * stay the truth; otherwise only the count changes. Counts are clamped to the
 * season's episode count when known. Returns null for an invalid change.
 */
export function applySeasonChange(
  current: SeasonWatch,
  change: SeasonChange,
  episodeCount: number | null,
): SeasonWatch | null {
  const max = limitOf(episodeCount);
  const ticking = current.episodesWatched.length > 0;
  const fromCount = (n: number): SeasonWatch => {
    const value = Math.max(0, Math.min(Math.trunc(n), max));
    return ticking
      ? { watchedEpisodes: value, episodesWatched: range(value) }
      : { watchedEpisodes: value, episodesWatched: [] };
  };

  switch (change.kind) {
    case 'inc': {
      if (!ticking) return fromCount(current.watchedEpisodes + 1);
      const have = new Set(current.episodesWatched);
      const next = range(max).find((n) => !have.has(n));
      if (next === undefined) return { ...current, watchedEpisodes: current.episodesWatched.length };
      const ticks = [...current.episodesWatched, next].sort((a, b) => a - b);
      return { watchedEpisodes: ticks.length, episodesWatched: ticks };
    }
    case 'set':
      if (typeof change.value !== 'number' || !Number.isFinite(change.value)) return null;
      return fromCount(change.value);
    case 'all':
      if (episodeCount == null || episodeCount <= 0) return null;
      return fromCount(episodeCount);
    case 'ticks': {
      const ticks = normalizeEpisodeTicks(change.episodes, episodeCount);
      return { watchedEpisodes: ticks.length, episodesWatched: ticks };
    }
    default:
      return null;
  }
}

/** Parse an untrusted SeasonChange (server action input). */
export function parseSeasonChange(input: unknown): SeasonChange | null {
  if (typeof input !== 'object' || input === null) return null;
  const c = input as Record<string, unknown>;
  switch (c.kind) {
    case 'inc':
    case 'all':
      return { kind: c.kind };
    case 'set':
      return typeof c.value === 'number' && Number.isFinite(c.value) ? { kind: 'set', value: c.value } : null;
    case 'ticks':
      return Array.isArray(c.episodes) && c.episodes.length <= MAX_EPISODES
        ? { kind: 'ticks', episodes: c.episodes as number[] }
        : null;
    default:
      return null;
  }
}

// ─── Season tier list and Arena (4.5) ───────────────────────────────────────

/** A season on the tier board / in the Arena. */
export interface SeasonItem {
  /** The SeasonActivity id. */
  id: string;
  seasonId: string;
  seasonNumber: number;
  title: string;
  imageUrl: string | null;
  airDate: string | null;
  episodeCount: number | null;
  watchedEpisodes: number;
  rating: number | null;
  tier: Tier | null;
  rankOrder: number | null;
  elo: number;
  duels: number;
}

/** Only seasons with watched episodes (or a score) are on the board. */
export function isSeasonRankable(s: { watchedEpisodes: number; rating: number | null }): boolean {
  return s.watchedEpisodes > 0 || s.rating != null;
}

export function buildSeasonBoard<T extends SeasonItem>(items: T[]): TierBoardData<T> {
  return buildItemBoard(items.filter(isSeasonRankable));
}

export interface SeasonMatchup<T extends SeasonItem = SeasonItem> {
  /** Shared whole-number score for a same-score duel; null for a tier-neighbour duel. */
  rating: number | null;
  a: T;
  b: T;
}

/**
 * The next season duel within one show: neighbours inside a tier when any
 * tier holds two seasons, else two seasons with the same whole score. Among
 * the valid pairs, the one with the fewest duels so far wins (4.3), ties
 * broken by `rand`.
 */
export function pickSeasonMatchup<T extends SeasonItem>(
  items: T[],
  rand: () => number = Math.random,
): SeasonMatchup<T> | null {
  const board = buildSeasonBoard(items);
  let pairs: [T, T][] = withinTierPairs(board);
  let rating: number | null = null;
  if (pairs.length === 0) {
    const rated = TIERS.flatMap((t) => board.tiers[t])
      .concat(board.tray)
      .filter((s) => s.rating != null);
    for (let i = 0; i < rated.length; i++) {
      for (let j = i + 1; j < rated.length; j++) {
        if (Math.floor(rated[i].rating!) === Math.floor(rated[j].rating!)) pairs.push([rated[i], rated[j]]);
      }
    }
    if (pairs.length === 0) return null;
  }
  const fewest = Math.min(...pairs.map(([p, q]) => p.duels + q.duels));
  pairs = pairs.filter(([p, q]) => p.duels + q.duels === fewest);
  const [a, b] = pairs[Math.min(pairs.length - 1, Math.floor(rand() * pairs.length))];
  if (a.tier === null || a.tier !== b.tier) rating = Math.floor(a.rating ?? 0);
  return { rating, a, b };
}
