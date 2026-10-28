// ───────────────────────────────────────────────────────────────────────────
//  Goals (spec 6.3): yearly targets and their progress from the diary. Pure
//  and client-safe.
//
//  A goal is (year, category, metric, target). `category` is a section slug,
//  or null for all sections. Which metrics make sense where:
//    - count:    any section, or all (games: "games beaten");
//    - pages:    books (or all, which means books);
//    - hours:    movies, TV or anime, or all of them (see measures.ts);
//    - episodes: TV or anime, or both (episode totals of finished titles).
//  Progress = the titles finished in the year (diary entries dated in it),
//  each counted once however often it was finished.
// ───────────────────────────────────────────────────────────────────────────

import { isCategorySlug, type CategorySlug } from '@/lib/categories';
import { MAX_YEAR, MIN_YEAR, yearBounds } from '@/lib/year-arena';
import { episodesOf, finishedIn, minutesOf, pagesOf } from './measures';
import type { FinishEntry, StatTitle } from './types';

export const GOAL_METRICS = ['count', 'pages', 'hours', 'episodes'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_TARGET_MAX = 100_000;
/** Goals per user and year (keeps the page and the work bounded). */
export const MAX_GOALS_PER_YEAR = 30;

/** Sections each metric applies to (null = every section is allowed). */
export const METRIC_SECTIONS: Record<GoalMetric, readonly CategorySlug[] | null> = {
  count: null,
  pages: ['books'],
  hours: ['movies', 'tv', 'anime'],
  episodes: ['tv', 'anime'],
};

export interface GoalInput {
  year: number;
  category: CategorySlug | null;
  metric: GoalMetric;
  target: number;
}

export interface Goal extends GoalInput {
  id: string;
}

export const isGoalMetric = (v: unknown): v is GoalMetric =>
  typeof v === 'string' && (GOAL_METRICS as readonly string[]).includes(v);

/** Whether `metric` can be measured for `category` (null = all sections). */
export function metricFits(metric: GoalMetric, category: CategorySlug | null): boolean {
  const allowed = METRIC_SECTIONS[metric];
  return category === null || allowed === null || allowed.includes(category);
}

/** Validates raw input from the client; returns the goal or a message. */
export function parseGoalInput(raw: unknown): { ok: true; goal: GoalInput } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Invalid goal.' };
  const r = raw as Record<string, unknown>;
  const year = r.year;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return { ok: false, error: 'Pick a year.' };
  }
  const category = r.category === null || r.category === '' || r.category === 'all' ? null : r.category;
  if (category !== null && (typeof category !== 'string' || !isCategorySlug(category))) {
    return { ok: false, error: 'Unknown section.' };
  }
  if (!isGoalMetric(r.metric)) return { ok: false, error: 'Unknown goal type.' };
  const target = parseGoalTarget(r.target);
  if (target === null) return { ok: false, error: `The target must be a whole number from 1 to ${GOAL_TARGET_MAX.toLocaleString('en-US')}.` };
  if (!metricFits(r.metric, category)) return { ok: false, error: `${metricLabel(r.metric)} can't be measured for that section.` };
  return { ok: true, goal: { year, category, metric: r.metric, target } };
}

/** A whole number 1…GOAL_TARGET_MAX, or null. */
export function parseGoalTarget(v: unknown): number | null {
  const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= GOAL_TARGET_MAX ? n : null;
}

export function metricLabel(metric: GoalMetric): string {
  switch (metric) {
    case 'count':
      return 'Titles finished';
    case 'pages':
      return 'Pages';
    case 'hours':
      return 'Hours';
    case 'episodes':
      return 'Episodes';
  }
}

/** Unit words for a value: "12 books read", "40 hours", "3 games beaten". */
export function goalUnit(metric: GoalMetric, category: CategorySlug | null, n: number): string {
  const s = n === 1 ? '' : 's';
  switch (metric) {
    case 'pages':
      return `page${s} read`;
    case 'hours':
      return `hour${s} watched`;
    case 'episodes':
      return `episode${s} watched`;
    case 'count':
      switch (category) {
        case 'books':
          return `book${s} read`;
        case 'movies':
          return `movie${s} watched`;
        case 'tv':
          return `show${s} watched`;
        case 'anime':
          return `anime watched`;
        case 'manga':
          return `manga read`;
        case 'games':
          return `game${s} beaten`;
        case 'music':
          return `album${s} heard`;
        default:
          return `title${s} finished`;
      }
  }
}

/** The current value of a goal from the year's finishes. */
export function goalValue(
  goal: Pick<GoalInput, 'year' | 'category' | 'metric'>,
  titles: readonly StatTitle[],
  entries: readonly FinishEntry[],
): number {
  const { titles: done } = finishedIn(titles, entries, yearBounds(goal.year));
  const allowed = METRIC_SECTIONS[goal.metric];
  const pool = done.filter((t) =>
    goal.category !== null ? t.category === goal.category : allowed === null || allowed.includes(t.category),
  );
  switch (goal.metric) {
    case 'count':
      return pool.length;
    case 'pages':
      return pool.reduce((n, t) => n + pagesOf(t), 0);
    case 'episodes':
      return pool.reduce((n, t) => n + episodesOf(t), 0);
    case 'hours':
      return Math.floor(pool.reduce((n, t) => n + minutesOf(t), 0) / 60);
  }
}

export interface GoalProgress extends Goal {
  value: number;
  /** value ÷ target, capped at 1. */
  share: number;
  done: boolean;
}

/** Goals with their progress, all sections first, then by section and metric. */
export function goalsProgress(
  goals: readonly Goal[],
  titles: readonly StatTitle[],
  entries: readonly FinishEntry[],
): GoalProgress[] {
  const order = (g: Goal) => `${g.category ?? ''}|${GOAL_METRICS.indexOf(g.metric)}`;
  return [...goals]
    .sort((a, b) => order(a).localeCompare(order(b)))
    .map((g) => {
      const value = goalValue(g, titles, entries);
      return { ...g, value, share: Math.min(1, value / g.target), done: value >= g.target };
    });
}
