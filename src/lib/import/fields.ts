// ───────────────────────────────────────────────────────────────────────────
//  Small cell readers shared by the import sources: days, years, ratings,
//  ISBNs and tag lists, each forgiving about how exports write them. Pure.
// ───────────────────────────────────────────────────────────────────────────

import { isYmd } from '@/lib/release';
import { normalizeRating } from '@/lib/rating';

/**
 * A calendar day from an export cell: "2024-03-09", "2024/03/09", or the
 * same with a time after it ("2024-03-09 14:02:11"). Anything else → undefined.
 */
export function parseDay(cell: string | null | undefined): string | undefined {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[ T])/.exec((cell ?? '').trim());
  if (!m) return undefined;
  const ymd = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isYmd(ymd) ? ymd : undefined;
}

/**
 * The stored timestamp for an imported calendar day: noon UTC. A day in an
 * export has no time zone; noon keeps it on the same calendar day in every
 * zone from UTC−11 to UTC+11, so `todayYmd(prefs.timeZone, finishedAt)` gives
 * back the day the user wrote (spec G10).
 */
export function dayToDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

/** A plausible release year (1800 … next year + 5), else undefined. */
export function parseYear(cell: string | number | null | undefined): number | undefined {
  const n = typeof cell === 'number' ? cell : Number(String(cell ?? '').trim().slice(0, 4));
  const max = new Date().getUTCFullYear() + 5;
  return Number.isInteger(n) && n >= 1800 && n <= max ? n : undefined;
}

/**
 * A score on `scale` (5 for stars, 10 for tens) → 0–10, one decimal. Empty,
 * non-numeric, zero ("unrated" in Goodreads / StoryGraph) and out-of-range
 * cells give undefined. Half and quarter stars survive: 3.5★ → 7, 4.25★ → 8.5.
 */
export function parseRating(cell: string | number | null | undefined, scale: 5 | 10): number | undefined {
  const text = String(cell ?? '').trim().replace(',', '.');
  if (text === '') return undefined;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0 || n > scale) return undefined;
  return normalizeRating((n * 10) / scale) ?? undefined;
}

/** A non-negative whole number, or undefined. */
export function parseCount(cell: string | number | null | undefined): number | undefined {
  const text = String(cell ?? '').trim();
  if (!/^\d+$/.test(text)) return undefined;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : undefined;
}

/**
 * An ISBN-10 or ISBN-13 from a cell. Goodreads wraps them as ="9780…" so
 * spreadsheets keep the leading zeros; hyphens and spaces are dropped. Cells
 * that aren't 10 / 13 characters of digits (StoryGraph "UIDs") → undefined.
 */
export function parseIsbn(cell: string | null | undefined): string | undefined {
  const s = (cell ?? '')
    .trim()
    .replace(/^="?|"$/g, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
  return /^\d{13}$/.test(s) || /^\d{9}[\dX]$/.test(s) ? s : undefined;
}

/** Split a list cell ("a, b , c" or "a; b") into trimmed, distinct, non-empty parts. */
export function splitList(cell: string | null | undefined, sep: RegExp = /[,;]/): string[] {
  const out: string[] = [];
  for (const part of (cell ?? '').split(sep)) {
    const t = part.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Trimmed text, or undefined when empty. */
export function text(cell: string | null | undefined): string | undefined {
  const t = (cell ?? '').trim();
  return t ? t : undefined;
}
