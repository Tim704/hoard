// ───────────────────────────────────────────────────────────────────────────
//  Saved views (spec 8.6): a named filter over the whole library, kept in
//  SavedView.query and listed under "Views" in the navigation. Pure and
//  client-safe: the /views builder and the server actions share it.
//
//  The query (zod; unknown keys dropped, every field forgiving so an old or
//  hand-edited row still opens):
//  - sections / statuses: any of these (empty = all);
//  - tags: titles carrying ALL of them (case-insensitive, as on the tag filter);
//  - genres: titles with ANY of them (case-insensitive);
//  - maxMinutes: titles whose length estimate (src/lib/tonight.ts) is known
//    and at most this many minutes — an episode for series, the whole thing
//    for films, books and games;
//  - score and year ranges, inclusive (a title without a score or year is
//    left out once its range is set; reversed bounds are swapped);
//  - sort: recently added, score, title, release (newest first) or tier list.
//  Arrays are bounded (sections 7, statuses 6, tags and genres 20 each).
// ───────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

import { CATEGORY_SLUGS, isCategorySlug, type CategorySlug } from './categories';
import { isStatus, type Status } from './status';
import { hasAllTags, normalizeTags, tagKey } from './tags';
import { compareTierOrder, isTierEligible } from './tiers';
import { estimateMinutes } from './tonight';
import type { ActivityWithMedia } from './types';

export const VIEW_SORTS = ['recent', 'score', 'title', 'release', 'tier'] as const;
export type ViewSort = (typeof VIEW_SORTS)[number];

export const VIEW_SORT_LABEL: Record<ViewSort, string> = {
  recent: 'Recently added',
  score: 'Highest rated',
  title: 'Title (A–Z)',
  release: 'Newest release',
  tier: 'Tier list',
};

export const MAX_VIEW_NAME = 60;
export const MAX_VIEWS = 50;
const MAX_GENRES = 20;

const list = <T>(max: number, keep: (v: unknown) => v is T) =>
  z
    .unknown()
    .transform((v) => (Array.isArray(v) ? [...new Set(v.filter(keep))].slice(0, max) : []));

const bound = (min: number, max: number, int = false) =>
  z
    .unknown()
    .transform((v) =>
      typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? (int ? Math.round(v) : v) : null,
    );

const isSlug = (v: unknown): v is CategorySlug => typeof v === 'string' && isCategorySlug(v);
const isStatusValue = (v: unknown): v is Status => typeof v === 'string' && isStatus(v);
const isText = (v: unknown): v is string => typeof v === 'string';

export const ViewQuerySchema = z
  .object({
    sections: list(CATEGORY_SLUGS.length, isSlug),
    statuses: list(6, isStatusValue),
    tags: list(100, isText).transform((t) => normalizeTags(t)),
    genres: list(100, isText).transform((g) => {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const raw of g) {
        const name = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name || seen.has(tagKey(name))) continue;
        seen.add(tagKey(name));
        out.push(name);
      }
      return out.slice(0, MAX_GENRES);
    }),
    maxMinutes: bound(1, 100_000, true),
    scoreMin: bound(0, 10),
    scoreMax: bound(0, 10),
    yearMin: bound(1000, 3000, true),
    yearMax: bound(1000, 3000, true),
    sort: z.unknown().transform((v): ViewSort => (VIEW_SORTS as readonly unknown[]).includes(v) ? (v as ViewSort) : 'recent'),
  })
  .transform((q) => {
    const swap = <K extends 'score' | 'year'>(k: K) => {
      const lo = q[`${k}Min`];
      const hi = q[`${k}Max`];
      return lo != null && hi != null && lo > hi ? [hi, lo] : [lo, hi];
    };
    const [scoreMin, scoreMax] = swap('score');
    const [yearMin, yearMax] = swap('year');
    return { ...q, scoreMin, scoreMax, yearMin, yearMax };
  });

export type ViewQuery = z.output<typeof ViewQuerySchema>;

/** Any stored or posted value → a valid query (never throws). */
export function parseViewQuery(raw: unknown): ViewQuery {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return ViewQuerySchema.parse(obj);
}

export const EMPTY_VIEW: ViewQuery = parseViewQuery({});

/** A cleaned view name, or null when nothing is left. */
export function cleanViewName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return Array.from(name).slice(0, MAX_VIEW_NAME).join('').trim();
}

function genresOf(a: ActivityWithMedia): string[] {
  const g = a.media.genres;
  return Array.isArray(g) ? g.filter(isText) : [];
}

/** A title's release day or year as a sortable string ("" when unknown). */
function releaseKey(a: ActivityWithMedia): string {
  const d = a.media.releaseDate;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return a.media.year != null ? `${a.media.year}-99-99` : '';
}

/** Whether one title passes the view's filters. */
export function matchesView(a: ActivityWithMedia, q: ViewQuery): boolean {
  if (q.sections.length && !q.sections.includes(a.category)) return false;
  if (q.statuses.length && !q.statuses.includes(a.status)) return false;
  if (!hasAllTags(a.tags, q.tags)) return false;
  if (q.genres.length) {
    const own = new Set(genresOf(a).map(tagKey));
    if (!q.genres.some((g) => own.has(tagKey(g)))) return false;
  }
  if (q.maxMinutes != null) {
    const min = estimateMinutes(a.category, a.media).minutes;
    if (min == null || min > q.maxMinutes) return false;
  }
  if (q.scoreMin != null || q.scoreMax != null) {
    if (a.rating == null) return false;
    if (q.scoreMin != null && a.rating < q.scoreMin) return false;
    if (q.scoreMax != null && a.rating > q.scoreMax) return false;
  }
  if (q.yearMin != null || q.yearMax != null) {
    const y = a.media.year;
    if (y == null) return false;
    if (q.yearMin != null && y < q.yearMin) return false;
    if (q.yearMax != null && y > q.yearMax) return false;
  }
  return true;
}

/**
 * The view's titles in its order. `titleOf` gives the shown title (the
 * user's title language) for the title sort and tie-breaks.
 */
export function applyView<T extends ActivityWithMedia>(
  items: readonly T[],
  query: ViewQuery,
  titleOf: (a: T) => string = (a) => a.media.title,
): T[] {
  const byTitle = (a: T, b: T) => titleOf(a).localeCompare(titleOf(b));
  const out = items.filter((a) => matchesView(a, query));
  switch (query.sort) {
    case 'score':
      return out.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byTitle(a, b));
    case 'title':
      return out.sort(byTitle);
    case 'release':
      return out.sort((a, b) => {
        const ka = releaseKey(a);
        const kb = releaseKey(b);
        if (!ka || !kb) return (ka ? -1 : kb ? 1 : 0) || byTitle(a, b);
        return kb.localeCompare(ka) || byTitle(a, b);
      });
    case 'tier': {
      // Only finished-ish titles sit on a tier list; the rest follow, unranked.
      const placed = (a: T) => (a.tier != null && isTierEligible(a.status) ? a : { ...a, tier: null });
      return out
        .map((a) => [a, placed(a)] as const)
        .sort(([a, pa], [b, pb]) => compareTierOrder(pa, pb) || byTitle(a, b))
        .map(([a]) => a);
    }
    case 'recent':
    default:
      return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byTitle(a, b));
  }
}

/** True when the query filters nothing (the whole library). */
export function isEmptyView(q: ViewQuery): boolean {
  return (
    !q.sections.length &&
    !q.statuses.length &&
    !q.tags.length &&
    !q.genres.length &&
    q.maxMinutes == null &&
    q.scoreMin == null &&
    q.scoreMax == null &&
    q.yearMin == null &&
    q.yearMax == null
  );
}
