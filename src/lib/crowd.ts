// ───────────────────────────────────────────────────────────────────────────
//  "You vs. the crowd" (spec 1.9): the providers' community scores on the same
//  0–10 scale as yours. TMDB and MAL already are; IGDB's 0–100 is divided by
//  10. Books and music have no crowd score. Pure, shared by the section pages
//  and (later) the stats page.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';
import type { ActivityWithMedia } from './types';

/** The crowd's 0–10 score for a title, or null when there is none. */
export function crowdScore(media: Record<string, unknown>, slug: CategorySlug): number | null {
  const read = (key: string, scale: number): number | null => {
    const v = media[key];
    // 0 is what the providers report for "no votes yet".
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
    return Math.min(10, Math.round((v / scale) * 10) / 10);
  };
  switch (slug) {
    case 'movies':
    case 'tv':
      return read('tmdbRating', 1);
    case 'anime':
    case 'manga':
      return read('malScore', 1);
    case 'games':
      return read('igdbRating', 10);
    case 'books':
    case 'music':
      return null;
  }
}

type Scored = Pick<ActivityWithMedia, 'id' | 'category' | 'rating' | 'media'>;

export interface Disagreement<T extends Scored> {
  activity: T;
  /** Your score (0–10). */
  yours: number;
  crowd: number;
  /** yours − crowd: positive when you liked it more than the crowd. */
  diff: number;
}

/** Every scored title that has a crowd score, with the difference. */
export function crowdComparisons<T extends Scored>(list: T[]): Disagreement<T>[] {
  const out: Disagreement<T>[] = [];
  for (const a of list) {
    if (a.rating == null) continue;
    const crowd = crowdScore(a.media, a.category);
    if (crowd == null) continue;
    out.push({ activity: a, yours: a.rating, crowd, diff: Math.round((a.rating - crowd) * 10) / 10 });
  }
  return out;
}

/** The `n` titles where you and the crowd disagree most (by |yours − crowd|). */
export function biggestDisagreements<T extends Scored>(list: T[], n: number): Disagreement<T>[] {
  return crowdComparisons(list)
    .sort(
      (a, b) =>
        Math.abs(b.diff) - Math.abs(a.diff) ||
        a.activity.media.title.localeCompare(b.activity.media.title),
    )
    .slice(0, Math.max(0, n));
}

export interface CrowdSummary {
  /** Titles compared. */
  count: number;
  /** Mean of yours − crowd (negative: you score lower than the crowd). */
  meanDiff: number | null;
  /** Mean of |yours − crowd| — how far apart you typically are. */
  meanGap: number | null;
}

export function crowdSummary<T extends Scored>(list: T[]): CrowdSummary {
  const all = crowdComparisons(list);
  if (all.length === 0) return { count: 0, meanDiff: null, meanGap: null };
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    count: all.length,
    meanDiff: round(all.reduce((s, d) => s + d.diff, 0) / all.length),
    meanGap: round(all.reduce((s, d) => s + Math.abs(d.diff), 0) / all.length),
  };
}
