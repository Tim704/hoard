// ───────────────────────────────────────────────────────────────────────────
//  "Score these" (spec 1.3): finished titles still waiting for a score.
//  Finished = Completed, Retired or Dropped (the tier-eligible statuses).
//  8.1: a game played ≥ 10 h on Steam counts too, finished or not.
// ───────────────────────────────────────────────────────────────────────────

import { SCORE_PLAYTIME_MINUTES } from './import/sources/steam';
import { FINISHED_STATUSES } from './status';
import type { ActivityWithMedia } from './types';

type Scorable = Pick<ActivityWithMedia, 'status' | 'rating' | 'updatedAt'> &
  Partial<Pick<ActivityWithMedia, 'category' | 'playtimeMinutes'>>;

/** A game with enough Steam playtime to be worth scoring (8.1). */
export function playedEnough(a: Partial<Pick<ActivityWithMedia, 'category' | 'playtimeMinutes'>>): boolean {
  return a.category === 'games' && (a.playtimeMinutes ?? 0) >= SCORE_PLAYTIME_MINUTES;
}

/** Finished (or well-played) unscored titles, most recently touched first. */
export function unscoredFinished<T extends Scorable>(list: T[]): T[] {
  return list
    .filter((a) => a.rating == null && (FINISHED_STATUSES.includes(a.status) || playedEnough(a)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * An unscored title as the tier page sends it: its id when the board already
 * carries the title, else the title itself (a well-played game that isn't
 * finished, so not on the board).
 */
export type UnscoredEntry<T> = string | T;

/** `unscored` without repeating the titles in `onBoard`: each title crosses to the client once. */
export function packUnscored<T extends { id: string }>(unscored: readonly T[], onBoard: Iterable<T>): UnscoredEntry<T>[] {
  const ids = new Set<string>();
  for (const a of onBoard) ids.add(a.id);
  return unscored.map((a) => (ids.has(a.id) ? a.id : a));
}

/** packUnscored undone, in order: an id the board no longer has is skipped. */
export function unpackUnscored<T extends { id: string }>(entries: readonly UnscoredEntry<T>[], onBoard: Iterable<T>): T[] {
  const byId = new Map<string, T>();
  for (const a of onBoard) byId.set(a.id, a);
  return entries.flatMap((e) => {
    if (typeof e !== 'string') return [e];
    const a = byId.get(e);
    return a ? [a] : [];
  });
}
