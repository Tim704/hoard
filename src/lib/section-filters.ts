// ───────────────────────────────────────────────────────────────────────────
//  A section page's filters, sort and grouping (src/components/section/):
//  the state shape and its defaults, which of it is remembered per section
//  (localStorage, src/hooks/use-persistent-state.ts), how many settings
//  differ from the defaults (the Filters button's count), and the pure
//  filter / sort / grouping steps the page runs on its titles.
//
//  The remembered keys are the ones the page has always used
//  (`hoard:<section>:view|sort|grouped|franchises|collapsed`), with the same
//  values, so saved choices survive.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';
import { matchesOwnership } from './ownership';
import { orderQueue } from './queue';
import { isStatus, STATUS_ORDER, STATUSES, type Status } from './status';
import { hasAllTags } from './tags';
import { matchesTitle } from './title';
import { compareTierOrder } from './tiers';
import type { ActivityWithMedia, ViewMode } from './types';

export type SortMode = 'status' | 'recent' | 'rating' | 'ranking' | 'title';

export const SORT_LABEL: Record<SortMode, string> = {
  status: 'Status',
  recent: 'Recently added',
  rating: 'Highest rated',
  ranking: 'Tier list',
  title: 'Title (A–Z)',
};

/** The sort modes in menu order. */
export const SORT_MODES = Object.keys(SORT_LABEL) as SortMode[];

export type StatusFilter = 'ALL' | Status;

/** Everything the Filters popover sets. */
export interface SectionFilters {
  /** One status, or ALL. */
  status: StatusFilter;
  sort: SortMode;
  /** Owned platform (games) or format (books, manga, music): ALL, NONE or a value. */
  owned: string;
  /** Titles must carry all of these (4.2). */
  tags: string[];
  /** Fold a franchise's titles into one card. */
  groupFranchises: boolean;
  /** Split the page into status sections. */
  grouped: boolean;
}

export const DEFAULT_FILTERS: SectionFilters = {
  status: 'ALL',
  sort: 'status',
  owned: 'ALL',
  tags: [],
  groupFranchises: true,
  grouped: true,
};

/**
 * How many of the popover's settings differ from the defaults: the number
 * Reset would change, shown on the Filters button. Each selected tag counts.
 */
export function activeFilterCount(f: SectionFilters): number {
  return (
    (f.status !== DEFAULT_FILTERS.status ? 1 : 0) +
    (f.sort !== DEFAULT_FILTERS.sort ? 1 : 0) +
    (f.owned !== DEFAULT_FILTERS.owned ? 1 : 0) +
    f.tags.length +
    (f.groupFranchises !== DEFAULT_FILTERS.groupFranchises ? 1 : 0) +
    (f.grouped !== DEFAULT_FILTERS.grouped ? 1 : 0)
  );
}

// ── Remembered per section ──────────────────────────────────────────────────

/** The localStorage key of one remembered setting (unchanged since before layouts). */
export function sectionPrefKey(slug: CategorySlug, name: 'view' | 'sort' | 'grouped' | 'franchises' | 'collapsed'): string {
  return `hoard:${slug}:${name}`;
}

export const isViewMode = (v: unknown): v is ViewMode => v === 'grid' || v === 'list' || v === 'compact';
export const isSortMode = (v: unknown): v is SortMode =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(SORT_LABEL, v);
export const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
export const isStatusList = (v: unknown): v is Status[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && isStatus(x));

// ── Filtering, sorting, grouping ────────────────────────────────────────────

/** Section order when grouping by status: in progress first, dropped last. */
export const SECTION_ORDER: Status[] = [...STATUSES].sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);

/** Which section a franchise with mixed statuses lands in, best first. */
export const FRANCHISE_SECTION_PRIORITY: Status[] = [
  'CONSUMING',
  'COMPLETED',
  'ON_HOLD',
  'PLANNED',
  'RETIRED',
  'DROPPED',
];

/**
 * The titles to show, in order: the filters and the title text applied
 * (every stored title matches, e.g. anime's English, romaji and native),
 * then the sort. Planned titles follow the Up next queue whenever the sort
 * is by status or the page is grouped by status.
 */
export function applySectionFilters(
  activities: ActivityWithMedia[],
  f: Pick<SectionFilters, 'status' | 'sort' | 'owned' | 'tags' | 'grouped'>,
  text: string,
  titleOf: (media: ActivityWithMedia['media']) => string,
): ActivityWithMedia[] {
  const q = text.trim();
  const filtered = activities.filter(
    (a) =>
      (f.status === 'ALL' || a.status === f.status) &&
      matchesOwnership(a, f.owned) &&
      hasAllTags(a.tags, f.tags) &&
      (!q || matchesTitle(a.media, q)),
  );

  const byTitle = (a: ActivityWithMedia, b: ActivityWithMedia) => titleOf(a.media).localeCompare(titleOf(b.media));
  const sorted = [...filtered];
  switch (f.sort) {
    case 'status':
      // In progress first, then by rating (high first, unrated last), then title.
      sorted.sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.rating ?? -1) - (a.rating ?? -1) || byTitle(a, b),
      );
      break;
    case 'rating':
      sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      break;
    case 'ranking':
      // Tier list order: S→F by position, untiered after.
      sorted.sort(compareTierOrder);
      break;
    case 'title':
      sorted.sort(byTitle);
      break;
    case 'recent':
    default:
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
  }
  if (f.sort === 'status' || f.grouped) {
    const queue = orderQueue(sorted);
    let i = 0;
    return sorted.map((a) => (a.status === 'PLANNED' ? queue[i++] : a));
  }
  return sorted;
}

/**
 * With franchises grouped as well as statuses, a franchise is shown whole in
 * ONE status section: where you are in the IP (anything in progress, else
 * anything finished, …). Maps franchise id → section, for franchises with
 * two or more visible titles.
 */
export function franchiseSections(visible: ActivityWithMedia[]): Map<string, Status> {
  const members = new Map<string, Status[]>();
  for (const a of visible) {
    if (!a.franchise) continue;
    const list = members.get(a.franchise.id) ?? [];
    list.push(a.status);
    members.set(a.franchise.id, list);
  }
  const map = new Map<string, Status>();
  for (const [id, statuses] of members) {
    if (statuses.length < 2) continue;
    const best = FRANCHISE_SECTION_PRIORITY.find((s) => statuses.includes(s));
    if (best) map.set(id, best);
  }
  return map;
}

