// ───────────────────────────────────────────────────────────────────────────
//  Compare periods (spec 6.5): two ranges of days side by side — titles
//  finished per section, average score, top genres and hours. Pure and
//  client-safe. Ranges are inclusive YYYY-MM-DD days in the user's zone.
// ───────────────────────────────────────────────────────────────────────────

import { NAV_ORDER, type CategorySlug } from '@/lib/categories';
import { isYmd } from '@/lib/release';
import { averageScore, finishedIn, minutesOf } from './measures';
import { topGenres, type GenreRow } from './charts';
import type { DayRange, FinishEntry, StatTitle } from './types';

export const COMPARE_PRESETS = ['year', 'quarter', 'custom'] as const;
export type ComparePreset = (typeof COMPARE_PRESETS)[number];

/** The longest custom range accepted (about 20 years), to keep the work bounded. */
export const MAX_RANGE_DAYS = 7310;

const dayNum = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
const fromDayNum = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** A day moved by whole months, clamped to the target month's last day (31 Mar − 1 month = 28/29 Feb). */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export const addDays = (ymd: string, days: number): string => fromDayNum(dayNum(ymd) + days);

export interface ComparePair {
  preset: ComparePreset;
  a: DayRange & { label: string };
  b: DayRange & { label: string };
}

/** A valid inclusive range of real days, or null. */
export function parseRange(from: unknown, to: unknown): DayRange | null {
  if (!isYmd(from) || !isYmd(to) || from > to) return null;
  if (dayNum(to) - dayNum(from) > MAX_RANGE_DAYS) return null;
  return { from, to };
}

/**
 * The two ranges for a preset, relative to `today`:
 *  - year: this calendar year vs last year;
 *  - quarter: the last 3 months (ending today) vs the 3 months before;
 *  - custom: the given ranges, or the year preset when either is invalid.
 */
export function comparePair(
  preset: unknown,
  today: string,
  custom?: { a?: [unknown, unknown]; b?: [unknown, unknown] },
): ComparePair {
  if (preset === 'custom' && custom?.a && custom?.b) {
    const a = parseRange(custom.a[0], custom.a[1]);
    const b = parseRange(custom.b[0], custom.b[1]);
    if (a && b) return { preset: 'custom', a: { ...a, label: rangeLabel(a) }, b: { ...b, label: rangeLabel(b) } };
  }
  if (preset === 'quarter') {
    const aFrom = addDays(addMonths(today, -3), 1);
    const bTo = addDays(aFrom, -1);
    const bFrom = addDays(addMonths(bTo, -3), 1);
    return {
      preset: 'quarter',
      a: { from: aFrom, to: today, label: 'Last 3 months' },
      b: { from: bFrom, to: bTo, label: 'The 3 months before' },
    };
  }
  const y = Number(today.slice(0, 4));
  return {
    preset: 'year',
    a: { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) },
    b: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) },
  };
}

/** "2026-01-01 – 2026-03-31" style label for a custom range. */
export const rangeLabel = (r: DayRange): string => `${r.from} – ${r.to}`;

export interface PeriodSummary {
  range: DayRange;
  /** Distinct titles finished. */
  finished: number;
  perSection: { slug: CategorySlug; finished: number }[];
  avgScore: number | null;
  topGenres: GenreRow[];
  /** Approximate hours watched (see measures.ts), rounded. */
  hours: number;
}

/** What one period shows. */
export function periodSummary(titles: readonly StatTitle[], entries: readonly FinishEntry[], range: DayRange): PeriodSummary {
  const { titles: done } = finishedIn(titles, entries, range);
  return {
    range,
    finished: done.length,
    perSection: NAV_ORDER.map((slug) => ({ slug, finished: done.filter((t) => t.category === slug).length })),
    avgScore: averageScore(done),
    topGenres: topGenres(done, 5),
    hours: Math.round(done.reduce((n, t) => n + minutesOf(t), 0) / 60),
  };
}
