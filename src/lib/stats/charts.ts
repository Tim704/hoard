// ───────────────────────────────────────────────────────────────────────────
//  Stats charts (spec 6.2) and the all-sections crowd panel (1.9): pure data
//  shapers. The SVG lives in src/components/stats/charts.tsx.
// ───────────────────────────────────────────────────────────────────────────

import { NAV_ORDER, type CategorySlug } from '@/lib/categories';
import { STATUSES, type Status } from '@/lib/status';
import { yearBounds } from '@/lib/year-arena';
import { averageScore, countsAsFinished, finishedIn, mean1 } from './measures';
import type { FinishEntry, StatTitle } from './types';

/** Sections in navigation order that have at least one title. */
export function sectionsPresent(titles: readonly Pick<StatTitle, 'category'>[]): CategorySlug[] {
  const have = new Set(titles.map((t) => t.category));
  return NAV_ORDER.filter((s) => have.has(s));
}

export interface MonthColumn {
  /** 1–12. */
  month: number;
  counts: Partial<Record<CategorySlug, number>>;
  total: number;
}

/**
 * Finishes per month of `year`, stacked by section (a rewatch counts again).
 * `sections` lists the sections that appear, in navigation order.
 */
export function finishedPerMonth(
  titles: readonly StatTitle[],
  entries: readonly FinishEntry[],
  year: number,
): { sections: CategorySlug[]; months: MonthColumn[] } {
  const { titles: done, entries: inYear } = finishedIn(titles, entries, yearBounds(year));
  const cat = new Map(done.map((t) => [t.id, t.category]));
  const months: MonthColumn[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, counts: {}, total: 0 }));
  const seen = new Set<CategorySlug>();
  for (const e of inYear) {
    const slug = cat.get(e.activityId);
    const m = Number(e.date.slice(5, 7));
    if (!slug || m < 1 || m > 12) continue;
    const col = months[m - 1];
    col.counts[slug] = (col.counts[slug] ?? 0) + 1;
    col.total += 1;
    seen.add(slug);
  }
  return { sections: NAV_ORDER.filter((s) => seen.has(s)), months };
}

export interface GenreRow {
  genre: string;
  count: number;
  avgScore: number | null;
}

/**
 * The `n` genres of your finished titles with the most titles (ties: higher
 * average score, then name). Genres match case-insensitively; the first
 * spelling seen is shown.
 */
export function topGenres(titles: readonly StatTitle[], n = 10): GenreRow[] {
  const groups = new Map<string, { genre: string; titles: StatTitle[] }>();
  for (const t of titles) {
    if (!countsAsFinished(t)) continue;
    const mine = new Set<string>();
    for (const raw of t.media.genres) {
      const genre = raw.trim();
      const key = genre.toLowerCase();
      if (!genre || mine.has(key)) continue;
      mine.add(key);
      const g = groups.get(key) ?? { genre, titles: [] };
      g.titles.push(t);
      groups.set(key, g);
    }
  }
  return [...groups.values()]
    .map((g) => ({ genre: g.genre, count: g.titles.length, avgScore: averageScore(g.titles) }))
    .sort((a, b) => b.count - a.count || (b.avgScore ?? -1) - (a.avgScore ?? -1) || a.genre.localeCompare(b.genre))
    .slice(0, Math.max(0, n));
}

export interface YearScore {
  year: number;
  avgScore: number;
  /** Rated finishes behind the average. */
  count: number;
}

/**
 * Your average score of the titles finished each year (the score given with
 * the diary entry, else the title's current score), oldest year first. Years
 * without a rated finish are left out.
 */
export function avgScoreByYear(titles: readonly StatTitle[], entries: readonly FinishEntry[]): YearScore[] {
  const byId = new Map(titles.map((t) => [t.id, t]));
  const perYear = new Map<number, number[]>();
  for (const e of entries) {
    const t = byId.get(e.activityId);
    if (!t || !countsAsFinished(t)) continue;
    const score = e.rating ?? t.rating;
    const year = Number(e.date.slice(0, 4));
    if (score == null || !Number.isInteger(year)) continue;
    perYear.set(year, [...(perYear.get(year) ?? []), score]);
  }
  return [...perYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, scores]) => ({ year, avgScore: mean1(scores) as number, count: scores.length }));
}

export interface StatusMixRow {
  slug: CategorySlug;
  total: number;
  counts: Record<Status, number>;
}

/** How each section's titles split across the statuses (sections with titles only). */
export function statusMix(titles: readonly StatTitle[]): StatusMixRow[] {
  return sectionsPresent(titles).map((slug) => {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
    let total = 0;
    for (const t of titles) {
      if (t.category !== slug) continue;
      counts[t.status] += 1;
      total += 1;
    }
    return { slug, total, counts };
  });
}

export interface DropRateRow {
  slug: CategorySlug;
  dropped: number;
  /** Titles that ended one way or another: completed, retired or dropped. */
  ended: number;
  /** dropped ÷ ended (0–1), or null when nothing ended. */
  rate: number | null;
}

/** Per section: the share of ended titles that were dropped. */
export function dropRates(titles: readonly StatTitle[]): DropRateRow[] {
  return sectionsPresent(titles).map((slug) => {
    const mine = titles.filter((t) => t.category === slug);
    const dropped = mine.filter((t) => t.status === 'DROPPED').length;
    const ended = mine.filter((t) => t.status === 'DROPPED' || t.status === 'COMPLETED' || t.status === 'RETIRED').length;
    return { slug, dropped, ended, rate: ended ? dropped / ended : null };
  });
}

// ── You vs. the crowd, all sections (1.9) ──────────────────────────────────

export interface CrowdRow {
  id: string;
  slug: CategorySlug;
  title: string;
  yours: number;
  crowd: number;
  /** yours − crowd. */
  diff: number;
}

export interface CrowdOverview {
  /** The biggest disagreements across every section. */
  top: CrowdRow[];
  /** Per section with comparable titles: how many, and your mean difference. */
  sections: { slug: CategorySlug; count: number; meanDiff: number }[];
  count: number;
  meanDiff: number | null;
}

/**
 * The stats page's crowd panel: the `n` biggest differences between your
 * score and the provider's community score (src/lib/crowd.ts), and your
 * average difference per section. Books and music have no crowd score.
 */
export function crowdOverview(titles: readonly StatTitle[], n = 10): CrowdOverview {
  const rows: CrowdRow[] = [];
  for (const t of titles) {
    if (t.rating == null || t.media.crowd == null) continue;
    rows.push({
      id: t.id,
      slug: t.category,
      title: t.media.title,
      yours: t.rating,
      crowd: t.media.crowd,
      diff: Math.round((t.rating - t.media.crowd) * 10) / 10,
    });
  }
  const sections = NAV_ORDER.map((slug) => {
    const mine = rows.filter((r) => r.slug === slug);
    return { slug, count: mine.length, meanDiff: mean1(mine.map((r) => r.diff)) };
  })
    .filter((s): s is { slug: CategorySlug; count: number; meanDiff: number } => s.count > 0 && s.meanDiff != null);
  const top = [...rows]
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.title.localeCompare(b.title))
    .slice(0, Math.max(0, n));
  return { top, sections, count: rows.length, meanDiff: mean1(rows.map((r) => r.diff)) };
}
