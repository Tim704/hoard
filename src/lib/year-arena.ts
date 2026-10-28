// ───────────────────────────────────────────────────────────────────────────
//  Best of the year (spec 4.6). Pure and client-safe.
//
//  The candidates of year Y are the titles with a diary finish dated in Y
//  (a calendar day in the user's time zone, G10). Their duels live in
//  YearDuelScore (one row per title and year, created on the first duel),
//  separate from the section Arena's Elo. The ranking: year Elo, then the
//  title's score (so an un-dueled year still reads sensibly), then title.
// ───────────────────────────────────────────────────────────────────────────

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2999;

/** A plausible four-digit year (route params, action input). */
export function parseYear(v: unknown): number | null {
  const n = typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
}

/** The first and last day of a year as YYYY-MM-DD (diary dates compare as strings). */
export function yearBounds(year: number): { from: string; to: string } {
  const y = String(year).padStart(4, '0');
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** The distinct years of some YYYY-MM-DD dates, newest first. */
export function yearsOf(dates: readonly string[]): number[] {
  const years = new Set<number>();
  for (const d of dates) {
    const y = parseYear(d.slice(0, 4));
    if (y !== null && /^\d{4}-\d{2}-\d{2}$/.test(d)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

export interface YearRanked {
  id: string;
  elo: number;
  duels: number;
  rating: number | null;
  media: { title: string };
}

/** Best first: year Elo, then score (unrated last), then title, then id. */
export function rankYear<T extends YearRanked>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      b.elo - a.elo ||
      (b.rating ?? -1) - (a.rating ?? -1) ||
      a.media.title.localeCompare(b.media.title) ||
      a.id.localeCompare(b.id),
  );
}
