// ───────────────────────────────────────────────────────────────────────────
//  New seasons (spec 5.5): the pure rules. Client-safe (no prisma).
//
//  - Recording: when a TV title becomes Completed — or is started (Ongoing),
//    which also acknowledges a new season — `seenSeasonCount` is set to the
//    show's current `seasonCount`.
//  - Detection: a season numbered above `seenSeasonCount` (and within the
//    show's `seasonCount`) whose `airDate` is today or earlier is new. A
//    season without an air date is not out yet as far as we know.
//  - A Completed show with no `seenSeasonCount` yet (finished before this
//    feature) is baselined silently by the job, never notified.
// ───────────────────────────────────────────────────────────────────────────

import { isYmd } from '@/lib/release';
import type { Status } from '@/lib/status';

/** TMDB statuses after which a show gets no new seasons. */
const ENDED = new Set(['ended', 'canceled', 'cancelled']);

/** True when a show can still get seasons (unknown status counts as "can"). */
export function canGetSeasons(status: string | null | undefined): boolean {
  return !status || !ENDED.has(status.trim().toLowerCase());
}

/**
 * Whether a status change records the show's season count: entering
 * Completed (finished it) or Ongoing (started or resumed it). TV only.
 */
export function recordsSeenSeasons(
  category: string,
  from: Status | null | undefined,
  to: Status | null | undefined,
): boolean {
  const tv = category === 'tv' || category === 'TV';
  return tv && !!to && to !== from && (to === 'COMPLETED' || to === 'CONSUMING');
}

export interface SeasonAirInfo {
  seasonNumber: number;
  airDate: string | null;
}

export interface NewSeasonInput {
  seenSeasonCount: number | null | undefined;
  seasonCount: number | null | undefined;
  seasons: readonly SeasonAirInfo[];
}

/**
 * The season numbers that are new and have aired by `today` (YYYY-MM-DD),
 * ascending. Empty when nothing was recorded yet or nothing is new.
 */
export function newAiredSeasons(input: NewSeasonInput, today: string): number[] {
  const seen = input.seenSeasonCount;
  const count = input.seasonCount;
  if (seen == null || count == null || count <= seen) return [];
  return input.seasons
    .filter((s) => s.seasonNumber > seen && s.seasonNumber <= count)
    .filter((s) => isYmd(s.airDate) && s.airDate <= today)
    .map((s) => s.seasonNumber)
    .sort((a, b) => a - b);
}

/** The newest aired new season (the badge's number), or null. */
export function newSeasonBadge(input: NewSeasonInput, today: string): number | null {
  const fresh = newAiredSeasons(input, today);
  return fresh.length ? fresh[fresh.length - 1] : null;
}

/** The notification's dedupe key: one per (activity, season number). */
export function newSeasonKey(activityId: string, seasonNumber: number): string {
  return `new-season:${activityId}:${seasonNumber}`;
}
