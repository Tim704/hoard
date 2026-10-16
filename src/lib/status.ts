// ───────────────────────────────────────────────────────────────────────────
//  Status taxonomy.
//
//  The DB stores a stable base state (the `Status` union, mirroring the Prisma
//  `MediaStatus` enum). The UI shows natural, category-appropriate wording for
//  it — e.g. CONSUMING reads as "Watching" for movies but "Reading" for books —
//  via `statusLabel(status, slug)`. Each status also has a consistent accent
//  colour (theme-aware: tuned for both light and dark).
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';

export const STATUSES = [
  'PLANNED',
  'CONSUMING',
  'COMPLETED',
  'ON_HOLD',
  'DROPPED',
] as const;

export type Status = (typeof STATUSES)[number];

/** Generic, category-agnostic labels (fallback + <Select> default wording). */
export const STATUS_BASE_LABEL: Record<Status, string> = {
  PLANNED: 'Planned',
  CONSUMING: 'Ongoing',
  COMPLETED: 'Completed',
  ON_HOLD: 'Paused',
  DROPPED: 'Dropped',
};

/** Per-category natural wording. Anything omitted falls back to STATUS_BASE_LABEL. */
const STATUS_LABELS_BY_CATEGORY: Partial<
  Record<CategorySlug, Partial<Record<Status, string>>>
> = {
  books: { PLANNED: 'Unread', CONSUMING: 'Reading', COMPLETED: 'Read' },
  movies: { PLANNED: 'Unwatched', CONSUMING: 'Watching', COMPLETED: 'Watched' },
  tv: { PLANNED: 'Unwatched', CONSUMING: 'Watching', COMPLETED: 'Watched' },
  anime: { PLANNED: 'Unwatched', CONSUMING: 'Watching', COMPLETED: 'Watched' },
  manga: { PLANNED: 'Unread', CONSUMING: 'Reading', COMPLETED: 'Read' },
  games: { PLANNED: 'Unplayed', CONSUMING: 'Playing', COMPLETED: 'Beaten' },
  music: { PLANNED: 'Unheard', CONSUMING: 'Listening', COMPLETED: 'Listened' },
};

/** Natural label for a status, specialised per category when possible. */
export function statusLabel(status: Status, slug?: CategorySlug): string {
  if (slug) {
    const override = STATUS_LABELS_BY_CATEGORY[slug]?.[status];
    if (override) return override;
  }
  return STATUS_BASE_LABEL[status];
}

/**
 * Ordering for the default "by status" sort: in-progress first, then the
 * backlog, then finished, then the parked/abandoned tail.
 */
export const STATUS_ORDER: Record<Status, number> = {
  CONSUMING: 0,
  PLANNED: 1,
  COMPLETED: 2,
  ON_HOLD: 3,
  DROPPED: 4,
};

/** Badge styling per status — readable in both light and dark themes. */
export const STATUS_BADGE_CLASS: Record<Status, string> = {
  CONSUMING:
    'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  PLANNED: 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  COMPLETED:
    'border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300',
  ON_HOLD: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  DROPPED: 'border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

/** A solid status dot colour (used by the compact view). */
export const STATUS_DOT_CLASS: Record<Status, string> = {
  CONSUMING: 'bg-emerald-500',
  PLANNED: 'bg-sky-500',
  COMPLETED: 'bg-violet-500',
  ON_HOLD: 'bg-amber-500',
  DROPPED: 'bg-rose-500',
};

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}
