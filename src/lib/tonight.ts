// ───────────────────────────────────────────────────────────────────────────
//  The tonight picker (spec 5.2). Pure and client-safe.
//
//  Length estimates:
//    - movies: `runtime`;
//    - TV: one episode (`episodeRunTime` when stored, else 45 min); anime:
//      one episode, 24 min. As a whole series they also count as "a few
//      sessions";
//    - games: `timeToBeatHours`, always a multi-session item;
//    - books: pages ÷ 40 per hour (and also "a few sessions");
//    - albums: 45 min;
//    - manga: no estimate in the spec, so only "a few sessions".
//
//  Picks come from each section's Up next queue (PLANNED only, in queue
//  order): the fitting titles of every section are interleaved (the first of
//  each section, then the second of each, …), and "Another" steps through
//  that list three at a time, wrapping at the end.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import { ANIME_EPISODE_MINUTES, TV_EPISODE_MINUTES } from '@/lib/episode-length';

export type TimeChoice = '30m' | '1h' | '2h' | '3h' | 'sessions';

export const TIME_CHOICES: { value: TimeChoice; label: string }[] = [
  { value: '30m', label: '30 min' },
  { value: '1h', label: '1 h' },
  { value: '2h', label: '2 h' },
  { value: '3h', label: '3 h+' },
  { value: 'sessions', label: 'A few sessions' },
];

/** Minutes each choice allows (null = no upper bound). */
const LIMIT: Record<Exclude<TimeChoice, 'sessions'>, number | null> = {
  '30m': 30,
  '1h': 60,
  '2h': 120,
  '3h': null,
};

export const ANIME_EPISODE_MIN = ANIME_EPISODE_MINUTES;
export const TV_EPISODE_MIN = TV_EPISODE_MINUTES;
export const ALBUM_MIN = 45;
export const PAGES_PER_HOUR = 40;

export interface Estimate {
  /** Minutes for one sitting's worth (an episode, a film, a whole book), or null when unknown. */
  minutes: number | null;
  /** Can be done in one evening (games never are). */
  singleSitting: boolean;
  /** Belongs under "a few sessions" (games, books, manga, whole series). */
  sessions: boolean;
}

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** How long a title takes, per the rules at the top. */
export function estimateMinutes(slug: CategorySlug, media: Record<string, unknown>): Estimate {
  switch (slug) {
    case 'movies':
      return { minutes: positive(media.runtime), singleSitting: true, sessions: false };
    case 'tv':
      return { minutes: positive(media.episodeRunTime) ?? TV_EPISODE_MIN, singleSitting: true, sessions: true };
    case 'anime':
      return { minutes: ANIME_EPISODE_MIN, singleSitting: true, sessions: true };
    case 'games': {
      const h = positive(media.timeToBeatHours);
      return { minutes: h == null ? null : Math.round(h * 60), singleSitting: false, sessions: true };
    }
    case 'books': {
      const pages = positive(media.pageCount);
      return {
        minutes: pages == null ? null : Math.round((pages / PAGES_PER_HOUR) * 60),
        singleSitting: true,
        sessions: true,
      };
    }
    case 'music':
      return { minutes: ALBUM_MIN, singleSitting: true, sessions: false };
    case 'manga':
      return { minutes: null, singleSitting: false, sessions: true };
  }
}

/**
 * Does a title fit the time? "A few sessions" takes the multi-session kinds;
 * the others take single-sitting titles whose length is known and within the
 * limit ("3 h+" takes any single-sitting title, even of unknown length).
 */
export function fitsTime(e: Estimate, time: TimeChoice): boolean {
  if (time === 'sessions') return e.sessions;
  if (!e.singleSitting) return false;
  const limit = LIMIT[time];
  if (limit === null) return true;
  return e.minutes !== null && e.minutes <= limit;
}

/** "45 min", "2 h 10 min", "≈ 32 h" for long ones. */
export function formatMinutes(min: number | null): string | null {
  if (min == null || !Number.isFinite(min) || min <= 0) return null;
  if (min < 60) return `${Math.round(min)} min`;
  if (min >= 600) return `≈ ${Math.round(min / 60)} h`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export interface TonightCandidate {
  id: string;
  slug: CategorySlug;
  genres: string[];
  estimate: Estimate;
}

export interface TonightFilters {
  time: TimeChoice;
  /** Sections to pick from (empty = none). */
  sections: CategorySlug[];
  /** Genres to match (any of them); empty = every genre. */
  genres: string[];
}

/** The fitting titles, interleaved across sections, each section in queue order. */
export function tonightPool<T extends TonightCandidate>(
  queues: Partial<Record<CategorySlug, T[]>>,
  f: TonightFilters,
): T[] {
  const wanted = new Set(f.genres.map((g) => g.toLowerCase()));
  const lists = f.sections.map((slug) =>
    (queues[slug] ?? []).filter(
      (c) =>
        fitsTime(c.estimate, f.time) &&
        (wanted.size === 0 || c.genres.some((g) => wanted.has(g.toLowerCase()))),
    ),
  );
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

/** The `round`-th set of (up to) `count` picks: the next fitting titles, wrapping. */
export function pickTonight<T extends TonightCandidate>(
  queues: Partial<Record<CategorySlug, T[]>>,
  f: TonightFilters,
  round = 0,
  count = 3,
): T[] {
  const pool = tonightPool(queues, f);
  if (pool.length <= count) return pool;
  const start = (Math.max(0, Math.floor(round)) * count) % pool.length;
  return Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]);
}

/** The genres among the queued titles, alphabetical, each once (case-insensitive). */
export function genreOptions(candidates: { genres: string[] }[]): string[] {
  const seen = new Map<string, string>();
  for (const c of candidates) for (const g of c.genres) if (!seen.has(g.toLowerCase())) seen.set(g.toLowerCase(), g);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
