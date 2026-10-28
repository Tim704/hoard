// ───────────────────────────────────────────────────────────────────────────
//  Play sessions (spec 3.6) and the diary's views (3.1 / 3.4). Pure and
//  client-safe: grouping sessions into runs, a month calendar grid, diary
//  months and the "Watched 3× · last 12 Mar 2026" line. Days are YYYY-MM-DD
//  strings (G10), so all maths here is plain day numbers, never time zones.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';
import { formatYmd } from './release';
import { doneVerb } from './status';

/** Days since 1970-01-01 for a YYYY-MM-DD day. */
export function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Sessions closer than this many days belong to the same run. */
export const RUN_GAP_DAYS = 7;

export interface SessionLike {
  date: string;
  minutes: number | null;
}

export interface Run<T extends SessionLike> {
  start: string;
  end: string;
  sessions: T[];
  /** Total minutes logged (sessions without minutes count 0). */
  minutes: number;
}

/**
 * Sessions grouped into runs, oldest run first: a new run starts when the gap
 * to the previous session is RUN_GAP_DAYS or more (6 days apart = same run,
 * 7 = a new one). Sessions inside a run are oldest first.
 */
export function groupRuns<T extends SessionLike>(sessions: T[], gapDays: number = RUN_GAP_DAYS): Run<T>[] {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const runs: Run<T>[] = [];
  for (const s of sorted) {
    const last = runs[runs.length - 1];
    if (last && dayNumber(s.date) - dayNumber(last.end) < gapDays) {
      last.sessions.push(s);
      last.end = s.date;
      last.minutes += s.minutes ?? 0;
    } else {
      runs.push({ start: s.date, end: s.date, sessions: [s], minutes: s.minutes ?? 0 });
    }
  }
  return runs;
}

/** "45 min", "2 h", "2 h 5 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * A month as calendar weeks: each week has 7 cells (a YYYY-MM-DD day or null
 * for padding). `weekStart`: 0 = Sunday, 1 = Monday (prefs.weekStart).
 */
export function monthGrid(year: number, month: number, weekStart: number = 1): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The month before / after (month is 1–12). */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/** "March 2026" for a YYYY-MM key or day. */
export function monthLabel(ymOrYmd: string): string {
  const [y, m] = ymOrYmd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export interface DatedLike {
  date: string;
  createdAt?: string;
}

/** Entries grouped by month (YYYY-MM), newest month and newest entry first. */
export function groupByMonth<T extends DatedLike>(entries: T[]): { key: string; label: string; entries: T[] }[] {
  const sorted = [...entries].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  );
  const groups: { key: string; label: string; entries: T[] }[] = [];
  for (const e of sorted) {
    const key = e.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else groups.push({ key, label: monthLabel(key), entries: [e] });
  }
  return groups;
}

/** "Watched 3× · last 12 Mar 2026" ("Read once · 12 Mar 2026"); null with no entries. */
export function timesLine(slug: CategorySlug, dates: string[]): string | null {
  if (!dates.length) return null;
  const last = dates.reduce((a, b) => (b > a ? b : a));
  const verb = doneVerb(slug);
  return dates.length === 1 ? `${verb} once · ${formatYmd(last)}` : `${verb} ${dates.length}× · last ${formatYmd(last)}`;
}
