// ───────────────────────────────────────────────────────────────────────────
//  Stats (spec 6.x): the lean shapes every pure stats function works on.
//  The server loader (src/lib/data-stats.ts) selects only these columns from
//  the user's own rows; everything here is pure and client-safe.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import type { Status } from '@/lib/status';
import type { Tier } from '@/lib/tiers';

/** The media columns stats read (null / [] when the provider gave nothing). */
export interface StatMedia {
  /** In the owner's title language. */
  title: string;
  imageUrl: string | null;
  genres: string[];
  /** The release year (the year column, else the release date's), or null. */
  year: number | null;
  /** Movies: minutes. */
  runtime: number | null;
  /** TV: total episodes and the typical episode length in minutes. */
  episodeCount: number | null;
  episodeRunTime: number | null;
  /** Anime: total episodes. */
  episodes: number | null;
  /** Books. */
  pageCount: number | null;
  /** Manga. */
  chapters: number | null;
  /** Music. */
  trackCount: number | null;
  /** Movies and TV (F2 credits). */
  directors: string[];
  cast: string[];
  /** The provider's community score on 0–10 (src/lib/crowd.ts), or null. */
  crowd: number | null;
}

/** One of the user's titles, as stats see it. */
export interface StatTitle {
  id: string;
  category: CategorySlug;
  status: Status;
  rating: number | null;
  tier: Tier | null;
  progress: number | null;
  rewatching: boolean;
  franchise: { id: string; name: string } | null;
  media: StatMedia;
}

/** One diary entry (a finished run): its title and day (YYYY-MM-DD, user TZ). */
export interface FinishEntry {
  activityId: string;
  date: string;
  /** The score given with this finish, if any. */
  rating: number | null;
}

/** An inclusive range of calendar days. */
export interface DayRange {
  from: string;
  to: string;
}
