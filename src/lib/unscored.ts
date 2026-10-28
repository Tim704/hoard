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
