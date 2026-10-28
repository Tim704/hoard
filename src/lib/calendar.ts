// ───────────────────────────────────────────────────────────────────────────
//  The calendar (spec 5.6): pure day maths and item shapes. Client-safe.
//
//  Days are YYYY-MM-DD strings in the user's time zone (G10); the month grid
//  is built with UTC date maths on those strings, so no zone can shift a day.
//  The week starts on `prefs.weekStart` (0 = Sunday … 6 = Saturday).
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import { isYmd } from '@/lib/release';

export type CalendarKind = 'release' | 'episode' | 'airing' | 'sequel';

export interface CalendarItem {
  /** Stable id, also the iCal UID (without the @hoard suffix). */
  uid: string;
  kind: CalendarKind;
  /** YYYY-MM-DD in the user's time zone. */
  date: string;
  title: string;
  /** "Movie", "TV", "Episode 10", "New in Frieren (TV)" … */
  detail: string;
  slug: CategorySlug;
  /** In-app link (the title's details), or null. */
  href: string | null;
  imageUrl: string | null;
}

/** How each kind is named in the list and the iCal description. */
export const KIND_LABEL: Record<CalendarKind, string> = {
  release: 'Release',
  episode: 'Next episode',
  airing: 'Anime airing',
  sequel: 'Announced sequel',
};

const DAY_MS = 86_400_000;

function toUtc(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `ymd` plus `n` days. */
export function addDays(ymd: string, n: number): string {
  return fromUtc(toUtc(ymd) + n * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(toUtc(ymd)).getUTCDay();
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The seven weekday labels starting at `weekStart`. */
export function weekdayLabels(weekStart: number): string[] {
  const start = ((weekStart % 7) + 7) % 7;
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT[(start + i) % 7]);
}

/** A "YYYY-MM" month key → year and month (1–12), or null. */
export function parseMonth(v: unknown): { year: number; month: number } | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return null;
  return { year, month };
}

export function monthKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** The month `delta` months away. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/** First and last day of a month. */
export function monthBounds(year: number, month: number): { first: string; last: string } {
  const first = `${monthKey(year, month)}-01`;
  const next = shiftMonth(year, month, 1);
  return { first, last: addDays(`${monthKey(next.year, next.month)}-01`, -1) };
}

/**
 * The month as whole weeks starting on `weekStart`: the days before the 1st
 * and after the last day come from the neighbouring months.
 */
export function monthGrid(year: number, month: number, weekStart: number): string[][] {
  const { first, last } = monthBounds(year, month);
  const start = ((weekStart % 7) + 7) % 7;
  const lead = (weekdayOf(first) - start + 7) % 7;
  let day = addDays(first, -lead);
  const weeks: string[][] = [];
  while (day <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Items grouped by day, each day's items in kind then title order. */
export function itemsByDay(items: readonly CalendarItem[]): Map<string, CalendarItem[]> {
  const kindRank: Record<CalendarKind, number> = { release: 0, episode: 1, airing: 2, sequel: 3 };
  const out = new Map<string, CalendarItem[]>();
  for (const it of [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || kindRank[a.kind] - kindRank[b.kind] || a.title.localeCompare(b.title),
  )) {
    if (!isYmd(it.date)) continue;
    const list = out.get(it.date);
    if (list) list.push(it);
    else out.set(it.date, [it]);
  }
  return out;
}

/** The window the iCal feed covers: the past 7 days to 180 days ahead. */
export function feedWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -7), to: addDays(today, 180) };
}
