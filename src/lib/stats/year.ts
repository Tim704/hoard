// ───────────────────────────────────────────────────────────────────────────
//  Year in review (spec 6.1): one year's totals, metrics, new S-tier titles,
//  top franchise and busiest month, from the diary. Pure and client-safe.
//
//  "Finished in Y" = a diary entry dated in Y (a calendar day in the user's
//  time zone, G10) on a title that is completed or retired now (or being
//  rewatched after such a finish) — the same rule as the best-of-year Arena.
// ───────────────────────────────────────────────────────────────────────────

import { NAV_ORDER, type CategorySlug } from '@/lib/categories';
import { yearBounds } from '@/lib/year-arena';
import { averageScore, chaptersOf, episodesOf, finishedIn, minutesOf, pagesOf } from './measures';
import type { FinishEntry, StatTitle } from './types';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

export interface SectionYear {
  slug: CategorySlug;
  /** Distinct titles finished. */
  finished: number;
  /** Diary entries (a rewatch counts again). */
  finishes: number;
  avgScore: number | null;
}

export interface YearSummary {
  year: number;
  /** Distinct titles finished in the year. */
  finished: number;
  /** Diary entries in the year (rewatches included). */
  finishes: number;
  /** Per visible section with at least one finish, in navigation order. */
  sections: SectionYear[];
  /** Hours watched (approximation, see measures.ts), rounded. */
  hours: number;
  pages: number;
  episodes: number;
  chapters: number;
  /** Games beaten (finished games). */
  games: number;
  albums: number;
  avgScore: number | null;
  /** Finished in the year and in tier S now, best score first. */
  sTier: StatTitle[];
  /** The franchise with the most titles finished in the year (ties: higher average score). */
  topFranchise: { name: string; count: number; avgScore: number | null } | null;
  /** The month (1–12) with the most finishes (ties: the earlier month). */
  busiestMonth: { month: number; finishes: number } | null;
}

const byScoreThenTitle = (a: StatTitle, b: StatTitle) =>
  (b.rating ?? -1) - (a.rating ?? -1) || a.media.title.localeCompare(b.media.title) || a.id.localeCompare(b.id);

/** Everything 6.1 shows for `year` (without the Arena top 3, which needs the duel table). */
export function yearSummary(titles: readonly StatTitle[], entries: readonly FinishEntry[], year: number): YearSummary {
  const { titles: done, entries: inYear } = finishedIn(titles, entries, yearBounds(year));
  const byId = new Map(done.map((t) => [t.id, t]));

  const sections: SectionYear[] = [];
  for (const slug of NAV_ORDER) {
    const list = done.filter((t) => t.category === slug);
    if (list.length === 0) continue;
    sections.push({
      slug,
      finished: list.length,
      finishes: inYear.filter((e) => byId.get(e.activityId)?.category === slug).length,
      avgScore: averageScore(list),
    });
  }

  const sum = (f: (t: StatTitle) => number) => done.reduce((n, t) => n + f(t), 0);
  const count = (slug: CategorySlug) => done.filter((t) => t.category === slug).length;

  return {
    year,
    finished: done.length,
    finishes: inYear.length,
    sections,
    hours: Math.round(sum(minutesOf) / 60),
    pages: sum(pagesOf),
    episodes: sum(episodesOf),
    chapters: sum(chaptersOf),
    games: count('games'),
    albums: count('music'),
    avgScore: averageScore(done),
    sTier: done.filter((t) => t.tier === 'S').sort(byScoreThenTitle),
    topFranchise: topFranchise(done),
    busiestMonth: busiestMonth(inYear),
  };
}

/** Most titles; ties → higher average score → name. Null when none belongs to a franchise. */
export function topFranchise(done: readonly StatTitle[]): YearSummary['topFranchise'] {
  const groups = new Map<string, { name: string; titles: StatTitle[] }>();
  for (const t of done) {
    if (!t.franchise) continue;
    const g = groups.get(t.franchise.id) ?? { name: t.franchise.name, titles: [] };
    g.titles.push(t);
    groups.set(t.franchise.id, g);
  }
  const ranked = [...groups.values()]
    .map((g) => ({ name: g.name, count: g.titles.length, avgScore: averageScore(g.titles) }))
    .sort(
      (a, b) =>
        b.count - a.count || (b.avgScore ?? -1) - (a.avgScore ?? -1) || a.name.localeCompare(b.name),
    );
  return ranked[0] ?? null;
}

/** The month with the most diary entries; ties → the earlier month. */
export function busiestMonth(entries: readonly FinishEntry[]): YearSummary['busiestMonth'] {
  const counts = new Array<number>(12).fill(0);
  for (const e of entries) {
    const m = Number(e.date.slice(5, 7));
    if (m >= 1 && m <= 12) counts[m - 1] += 1;
  }
  let best = -1;
  for (let i = 0; i < 12; i++) if (counts[i] > 0 && (best < 0 || counts[i] > counts[best])) best = i;
  return best < 0 ? null : { month: best + 1, finishes: counts[best] };
}

/**
 * The few numbers the AI verdict prompt sees (6.1): no notes, no reviews,
 * nothing outside the year's summary.
 */
export function yearPromptLines(
  s: YearSummary,
  labels: Record<CategorySlug, string>,
  topThree: readonly string[],
): string[] {
  const lines = [
    `Year: ${s.year}`,
    `Titles finished: ${s.finished}${s.finishes > s.finished ? ` (${s.finishes} finishes counting repeats)` : ''}`,
    ...s.sections.map(
      (x) => `- ${labels[x.slug]}: ${x.finished}${x.avgScore != null ? `, average score ${x.avgScore}/10` : ''}`,
    ),
  ];
  if (s.hours) lines.push(`Hours watched (approx.): ${s.hours}`);
  if (s.pages) lines.push(`Pages read: ${s.pages}`);
  if (s.episodes) lines.push(`Episodes watched: ${s.episodes}`);
  if (s.avgScore != null) lines.push(`Average score: ${s.avgScore}/10`);
  if (s.busiestMonth) lines.push(`Busiest month: ${MONTH_NAMES[s.busiestMonth.month - 1]} (${s.busiestMonth.finishes})`);
  if (s.topFranchise) lines.push(`Top franchise: ${s.topFranchise.name} (${s.topFranchise.count} titles)`);
  if (s.sTier.length) lines.push(`New S-tier titles: ${s.sTier.slice(0, 10).map((t) => t.media.title).join('; ')}`);
  if (topThree.length) lines.push(`Their top 3 of the year: ${topThree.join('; ')}`);
  return lines;
}
