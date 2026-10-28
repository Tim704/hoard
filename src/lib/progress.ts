// ───────────────────────────────────────────────────────────────────────────
//  Progress through a title (spec 1.4): pages, chapters, episodes or tracks
//  done, against the media's own count. Pure and client-safe.
//
//  Movies and games have no countable units, so they don't track progress.
//  Music does, but it is optional: hidden until the user opens "Track
//  progress" or a value is already stored.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';
import type { MediaItem } from './types';

/** Upper bound for a stored progress value (sanity, not a real limit). */
export const MAX_PROGRESS = 100_000;

/** The media column holding each tracked category's total. */
const TOTAL_FIELD: Partial<Record<CategorySlug, string>> = {
  books: 'pageCount',
  manga: 'chapters',
  anime: 'episodes',
  tv: 'episodeCount',
  music: 'trackCount',
};

const UNIT: Partial<Record<CategorySlug, [one: string, many: string]>> = {
  books: ['page', 'pages'],
  manga: ['chapter', 'chapters'],
  anime: ['episode', 'episodes'],
  tv: ['episode', 'episodes'],
  music: ['track', 'tracks'],
};

interface ProgressSubject {
  category: CategorySlug;
  media: MediaItem;
}

/** Whether a category counts progress at all. */
export function tracksProgress(slug: CategorySlug): boolean {
  return slug in TOTAL_FIELD;
}

/** Whether progress is shown without asking (music only once something is stored). */
export function progressShownByDefault(a: { category: CategorySlug; progress: number | null }): boolean {
  if (!tracksProgress(a.category)) return false;
  return a.category !== 'music' || a.progress != null;
}

/** The title's total units (pages, chapters, …), or null when unknown / untracked. */
export function progressTotal(a: ProgressSubject): number | null {
  const field = TOTAL_FIELD[a.category];
  if (!field) return null;
  const v = a.media[field];
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;
}

/** "page" / "pages" etc. for a count. */
export function progressUnit(slug: CategorySlug, n: number): string {
  const unit = UNIT[slug] ?? ['item', 'items'];
  return n === 1 ? unit[0] : unit[1];
}

/** "120 / 240 pages", or "9 episodes" when the total is unknown. */
export function progressText(slug: CategorySlug, progress: number, total: number | null): string {
  return total != null
    ? `${progress} / ${total} ${progressUnit(slug, total)}`
    : `${progress} ${progressUnit(slug, progress)}`;
}

/** Share done, clamped to 0…1, or null without a known total. */
export function progressFraction(progress: number | null, total: number | null): number | null {
  if (progress == null || total == null) return null;
  return Math.min(1, Math.max(0, progress / total));
}

/** A whole number of units the server will store, or null for anything else. */
export function validProgress(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_PROGRESS ? v : null;
}

/**
 * Parse the typed progress box: "" clears it (null), a whole number in range is
 * kept, anything else is `undefined` (invalid: keep the previous value).
 */
export function parseProgressInput(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return undefined;
  return validProgress(Number(t)) ?? undefined;
}
