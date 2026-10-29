// ───────────────────────────────────────────────────────────────────────────
//  "You vs. the crowd" (spec 1.9): the providers' community scores on the same
//  0–10 scale as yours. TMDB and MAL already are; IGDB's 0–100 is divided by
//  10. Books and music have no crowd score. Pure; used by the stats page's
//  crowd panel (src/lib/stats/charts.ts does the comparing).
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';

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
