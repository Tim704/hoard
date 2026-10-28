// ───────────────────────────────────────────────────────────────────────────
//  Taste trends (spec 6.4). Pure and client-safe.
//
//  - Drop point: for each title you dropped, how far in you were when you
//    dropped it — the progress value in force at the DROPPED status event
//    (the latest progress event at or before it), falling back to the
//    title's current progress — then the median per section.
//  - Genre drift: your average score per genre per year (top genres).
// ───────────────────────────────────────────────────────────────────────────

import { NAV_ORDER, type CategorySlug } from '@/lib/categories';
import { tracksProgress } from '@/lib/progress';
import { countsAsFinished, mean1 } from './measures';
import { topGenres } from './charts';
import type { FinishEntry, StatTitle } from './types';

export interface DropEvent {
  kind: string;
  to: string | null;
  at: Date;
}

const asCount = (v: string | null): number | null => {
  if (v == null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
};

/**
 * The progress a title had when it was (last) dropped: the latest `progress`
 * event at or before the last status event to DROPPED. Without such a status
 * event, or without a progress event before it, the title's current progress.
 */
export function progressAtDrop(events: readonly DropEvent[], current: number | null): number | null {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  let dropAt: number | null = null;
  for (const e of sorted) if (e.kind === 'status' && e.to === 'DROPPED') dropAt = e.at.getTime();
  if (dropAt == null) return current;
  let value: number | null | undefined;
  for (const e of sorted) {
    if (e.at.getTime() > dropAt) break;
    if (e.kind === 'progress') value = asCount(e.to);
  }
  return value ?? current;
}

/** The median of some numbers (mean of the middle two for an even count), or null. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface DropInput {
  category: CategorySlug;
  /** Progress at the drop (progressAtDrop), or null when unknown. */
  progress: number | null;
  /** The title's total units (progressTotal), or null when unknown. */
  total: number | null;
}

export interface DropPoint {
  slug: CategorySlug;
  /** Titles dropped in the section. */
  dropped: number;
  /** Drops with a known progress value (behind `medianProgress`). */
  measured: number;
  medianProgress: number | null;
  /** Median of progress ÷ total (0–1) over drops with a known total. */
  medianShare: number | null;
}

/** The median drop point per section that counts progress (sections with drops only). */
export function dropPoints(drops: readonly DropInput[]): DropPoint[] {
  const out: DropPoint[] = [];
  for (const slug of NAV_ORDER) {
    if (!tracksProgress(slug)) continue;
    const mine = drops.filter((d) => d.category === slug);
    if (mine.length === 0) continue;
    const known = mine.filter((d) => d.progress != null) as (DropInput & { progress: number })[];
    const shares = known
      .filter((d) => d.total != null && d.total > 0)
      .map((d) => Math.min(1, d.progress / (d.total as number)));
    out.push({
      slug,
      dropped: mine.length,
      measured: known.length,
      medianProgress: median(known.map((d) => d.progress)),
      medianShare: median(shares),
    });
  }
  return out;
}

const UNIT: Partial<Record<CategorySlug, string>> = {
  books: 'page',
  manga: 'chapter',
  anime: 'episode',
  tv: 'episode',
  music: 'track',
};

/**
 * "around episode 4" for shows (episodes are how people think about them),
 * "around 35%" elsewhere when totals are known, else "around page 120";
 * null when no drop had a known progress.
 */
export function dropPointPhrase(p: DropPoint): string | null {
  const episodic = p.slug === 'tv' || p.slug === 'anime';
  if (!episodic && p.medianShare != null) return `around ${Math.round(p.medianShare * 100)}%`;
  if (p.medianProgress != null) return `around ${UNIT[p.slug] ?? 'item'} ${Math.max(1, Math.round(p.medianProgress))}`;
  return null;
}

export interface GenreDrift {
  genres: string[];
  years: number[];
  /** avg[genre][i] = your average score for that genre in years[i], or null. */
  rows: { genre: string; scores: (number | null)[]; counts: number[] }[];
}

/**
 * Your average score per genre per year: the top `nGenres` genres of your
 * finished titles, over the last `nYears` years that have a finish. A
 * finish's score is the one given with its diary entry, else the title's.
 */
export function genreDrift(
  titles: readonly StatTitle[],
  entries: readonly FinishEntry[],
  nGenres = 5,
  nYears = 6,
): GenreDrift {
  const genres = topGenres(titles, nGenres).map((g) => g.genre);
  const byId = new Map(titles.map((t) => [t.id, t]));
  const finishes = entries
    .map((e) => ({ e, t: byId.get(e.activityId) }))
    .filter((x): x is { e: FinishEntry; t: StatTitle } => x.t !== undefined && countsAsFinished(x.t));
  const years = [...new Set(finishes.map((x) => Number(x.e.date.slice(0, 4))))]
    .filter(Number.isInteger)
    .sort((a, b) => a - b)
    .slice(-nYears);
  const rows = genres.map((genre) => {
    const key = genre.toLowerCase();
    const per = years.map((year) =>
      finishes
        .filter(
          (x) =>
            Number(x.e.date.slice(0, 4)) === year && x.t.media.genres.some((g) => g.trim().toLowerCase() === key),
        )
        .map((x) => x.e.rating ?? x.t.rating)
        .filter((v): v is number => v != null),
    );
    return { genre, scores: per.map((s) => mean1(s)), counts: per.map((s) => s.length) };
  });
  return { genres, years, rows };
}
