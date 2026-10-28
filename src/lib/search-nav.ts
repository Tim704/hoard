import type { CategorySlug } from './categories';
import { formatScore, type ScoreFormat } from './rating';
import { statusLabel, type Status } from './status';

/** Move the result highlight by one, wrapping; no results → -1 (nothing). */
export function nextHighlight(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : length - 1;
  return (current + delta + length) % length;
}

/** Search-as-you-type needs at least 2 trimmed characters. */
export function shouldSearch(query: string): boolean {
  return query.trim().length >= 2;
}

/** Monotonic request ids so only the newest response is applied. */
export function createLatestGuard(): { next(): number; isLatest(id: number): boolean } {
  let latest = 0;
  return {
    next: () => ++latest,
    isLatest: (id) => id === latest,
  };
}

export function libraryBadge(
  entry: { status: Status; rating: number | null },
  slug: CategorySlug,
  format: ScoreFormat = 'ten',
): string {
  const label = statusLabel(entry.status, slug);
  return entry.rating === null
    ? `In library · ${label}`
    : `In library · ${label} ${formatScore(entry.rating, format)}`;
}
