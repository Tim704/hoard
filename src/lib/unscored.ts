// ───────────────────────────────────────────────────────────────────────────
//  "Score these" (spec 1.3): finished titles still waiting for a score.
//  Finished = Completed, Retired or Dropped (the tier-eligible statuses).
// ───────────────────────────────────────────────────────────────────────────

import { FINISHED_STATUSES } from './status';
import type { ActivityWithMedia } from './types';

/** Finished, unscored titles, most recently touched first. */
export function unscoredFinished<T extends Pick<ActivityWithMedia, 'status' | 'rating' | 'updatedAt'>>(
  list: T[],
): T[] {
  return list
    .filter((a) => a.rating == null && FINISHED_STATUSES.includes(a.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
