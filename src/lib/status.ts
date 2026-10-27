// ───────────────────────────────────────────────────────────────────────────
//  Status taxonomy.
//
//  The DB stores a stable base state (the `Status` union, mirroring the Prisma
//  `MediaStatus` enum). The UI shows natural, category-appropriate wording for
//  it — e.g. CONSUMING reads as "Watching" for movies but "Reading" for books —
//  via `statusLabel(status, slug)`. Each status also has a consistent accent
//  colour (theme-aware: tuned for both light and dark).
// ───────────────────────────────────────────────────────────────────────────

import {
  Check,
  Clock3,
  Pause,
  Play,
  X,
  type LucideIcon,
} from 'lucide-react';

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

/**
 * Badge styling per status — readable in both light and dark themes. In-progress
 * gets the strongest fill so it pops; the rest stay a muted tint.
 */
export const STATUS_BADGE_CLASS: Record<Status, string> = {
  CONSUMING:
    'border-emerald-500/60 bg-emerald-500/25 text-emerald-700 dark:text-emerald-200',
  PLANNED: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  COMPLETED:
    'border-violet-500/50 bg-violet-500/20 text-violet-700 dark:text-violet-300',
  ON_HOLD: 'border-amber-500/50 bg-amber-500/20 text-amber-700 dark:text-amber-300',
  DROPPED: 'border-rose-500/50 bg-rose-500/20 text-rose-700 dark:text-rose-300',
};

/** One icon per status, so states differ by shape as well as by tint. */
export const STATUS_ICON: Record<Status, LucideIcon> = {
  CONSUMING: Play,
  PLANNED: Clock3,
  COMPLETED: Check,
  ON_HOLD: Pause,
  DROPPED: X,
};

/** Text colour for a bare status icon (compact rows, section headers). */
export const STATUS_TEXT_CLASS: Record<Status, string> = {
  CONSUMING: 'text-emerald-600 dark:text-emerald-400',
  PLANNED: 'text-sky-600 dark:text-sky-400',
  COMPLETED: 'text-violet-600 dark:text-violet-400',
  ON_HOLD: 'text-amber-600 dark:text-amber-400',
  DROPPED: 'text-rose-600 dark:text-rose-400',
};

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

const WANT_VERB: Record<CategorySlug, string> = {
  movies: 'watch',
  tv: 'watch',
  anime: 'watch',
  books: 'read',
  manga: 'read',
  games: 'play',
  music: 'listen',
};

/** The two choices offered when adding a title: finished it, or want to. */
export function addChoiceLabels(slug: CategorySlug): { done: string; want: string } {
  return { done: statusLabel('COMPLETED', slug), want: `Want to ${WANT_VERB[slug]}` };
}
