// ───────────────────────────────────────────────────────────────────────────
//  Release-date rules (spec F2). Pure and client-safe.
//
//  Calendar days are `YYYY-MM-DD` strings in the user's time zone (G10), so
//  "today" comes from `todayYmd(timeZone)` and comparisons are plain string /
//  day-number maths, never UTC midnights.
//
//  - A full `releaseDate` decides on its own: out when it is today or earlier.
//  - A title with only a `year` counts as out when that year is not in the
//    future (a 2026 title is "out" all through 2026).
//  - A title with neither is treated as out: we don't know better.
// ───────────────────────────────────────────────────────────────────────────

export interface ReleaseInfo {
  releaseDate?: unknown;
  year?: unknown;
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30). */
export function isYmd(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = YMD.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * A YYYY-MM-DD string from provider date parts, or null unless all three are
 * present and form a real day (partial dates keep only the year, per F2).
 */
export function ymdFromParts(
  year: number | null | undefined,
  month: number | null | undefined,
  day: number | null | undefined,
): string | null {
  if (!year || !month || !day) return null;
  const s = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isYmd(s) ? s : null;
}

/** A provider "YYYY-MM-DD…" string trimmed to a valid day, or null. */
export function normalizeYmd(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, 10);
  return isYmd(s) ? s : null;
}

/** Today's calendar day in `timeZone` (e.g. Europe/Berlin), as YYYY-MM-DD. */
export function todayYmd(timeZone: string, now: Date = new Date()): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  } catch {
    // Unknown zone: fall back to UTC rather than throwing in a render.
    return now.toISOString().slice(0, 10);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function yearOf(media: ReleaseInfo): number | null {
  return typeof media.year === 'number' && Number.isFinite(media.year) ? media.year : null;
}

/** Has this title come out by `todayYmd`? See the rules at the top. */
export function isReleased(media: ReleaseInfo, todayYmd: string): boolean {
  if (isYmd(media.releaseDate)) return media.releaseDate <= todayYmd;
  const year = yearOf(media);
  if (year != null) return year <= Number(todayYmd.slice(0, 4));
  return true;
}

/**
 * Whole days until release: 0 on release day, positive when it is still to
 * come. Null when the day isn't known (no date, or only a year) or it is past.
 */
export function daysUntil(media: ReleaseInfo, todayYmd: string): number | null {
  if (!isYmd(media.releaseDate) || !isYmd(todayYmd)) return null;
  const diff = dayNumber(media.releaseDate) - dayNumber(todayYmd);
  return diff >= 0 ? diff : null;
}

/** "28 Oct 2026" for a YYYY-MM-DD day (formatted in UTC, so no zone shift). */
export function formatYmd(ymd: string): string {
  if (!isYmd(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * The countdown badge (5.9) for a Planned title: "in 12 days" / "in 1 day"
 * while its full release day is still ahead; null on or after the day, or
 * when only a year is known.
 */
export function countdownLabel(media: ReleaseInfo, todayYmd: string): string | null {
  const days = daysUntil(media, todayYmd);
  if (days == null || days < 1) return null;
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
