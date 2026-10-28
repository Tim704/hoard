// The roast / recommend prompt's title list (final review M6): one line per
// title, best first, and at most the top ROAST_MAX_TITLES, so the prompt (and
// the owner's Gemini bill) stays bounded however big a library gets.

import { formatRating } from '@/lib/rating';

export const ROAST_MAX_TITLES = 200;

/** "1. Title (year) — 8/10" lines for the top `max` rows (already ranked). */
export function roastListLines(
  ranked: { rating: number | null; media: { title: string; year?: number | null } }[],
  max: number = ROAST_MAX_TITLES,
): string {
  return ranked
    .slice(0, max)
    .map((a, i) => {
      const year = a.media.year ? ` (${a.media.year})` : '';
      return `${i + 1}. ${String(a.media.title).slice(0, 300)}${year} — ${formatRating(a.rating)}/10`;
    })
    .join('\n');
}
