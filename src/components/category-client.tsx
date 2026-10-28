'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Layers, ListTree, Rows3 } from 'lucide-react';

import { ActivityDetailDialog } from '@/components/activity-detail-dialog';
import { CrowdPanel } from '@/components/crowd-panel';
import { MediaCompact } from '@/components/media-compact';
import { MediaGrid } from '@/components/media-grid';
import { MediaTable } from '@/components/media-table';
import { useDisplayTitle } from '@/components/prefs-provider';
import { RoastButton } from '@/components/roast-button';
import { ScoreThese } from '@/components/score-these';
import { SearchDialog } from '@/components/search-dialog';
import { StatusSection } from '@/components/status-section';
import { ViewToggle } from '@/components/view-toggle';
import { Button, buttonVariants } from '@/components/ui/button';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CategoryConfig, CategorySlug } from '@/lib/categories';
import {
  isStatus,
  STATUS_ORDER,
  STATUSES,
  statusLabel,
  type Status,
} from '@/lib/status';
import { orderQueue } from '@/lib/queue';
import { matchesTitle } from '@/lib/title';
import { compareTierOrder, isTierEligible } from '@/lib/tiers';
import { toDisplayUnits, type ActivityWithMedia, type ViewMode } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CategoryClientProps {
  slug: CategorySlug;
  config: CategoryConfig;
  activities: ActivityWithMedia[];
  /** The user's franchises, for the detail dialog's franchise picker. */
  franchises: { id: string; name: string }[];
  /** Open the "Score these" dialog on arrival (linked from the tier list). */
  scoreOpen?: boolean;
  /** Open this activity's details on arrival (`?open=<id>`, from the Cmd/Ctrl+K palette). */
  openId?: string;
  /** Changes with every palette pick (`?t=`), so the same title reopens. */
  openNonce?: string;
}

type SortMode = 'status' | 'recent' | 'rating' | 'ranking' | 'title';
type StatusFilter = 'ALL' | Status;

const isViewMode = (v: unknown): v is ViewMode =>
  v === 'grid' || v === 'list' || v === 'compact';
const isSortMode = (v: unknown): v is SortMode =>
  typeof v === 'string' && v in SORT_LABEL;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isStatusList = (v: unknown): v is Status[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && isStatus(x));

/** Which section a franchise with mixed statuses lands in, best first. */
const FRANCHISE_SECTION_PRIORITY: Status[] = [
  'CONSUMING',
  'COMPLETED',
  'ON_HOLD',
  'PLANNED',
  'RETIRED',
  'DROPPED',
];

/** Section order when grouping by status: in progress first, dropped last. */
const SECTION_ORDER = [...STATUSES].sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);

const SORT_LABEL: Record<SortMode, string> = {
  status: 'Status',
  recent: 'Recently added',
  rating: 'Highest rated',
  ranking: 'Tier list',
  title: 'Title (A–Z)',
};

/**
 * The interactive shell for a category page: search/add, filter, sort, switch
 * between grid and table views, and open the detail dialog for any item.
 */
export function CategoryClient({
  slug,
  config,
  activities,
  franchises,
  scoreOpen = false,
  openId,
  openNonce,
}: CategoryClientProps) {
  // View preferences persist per category across visits.
  const key = (name: string) => `hoard:${slug}:${name}`;
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(key('view'), 'grid', isViewMode);
  const [sort, setSort] = usePersistentState<SortMode>(key('sort'), 'status', isSortMode);
  const [grouped, setGrouped] = usePersistentState<boolean>(key('grouped'), true, isBool);
  const [collapsed, setCollapsed] = usePersistentState<Status[]>(
    key('collapsed'),
    [],
    isStatusList,
  );
  const [groupFranchises, setGroupFranchises] = usePersistentState<boolean>(
    key('franchises'),
    true,
    isBool,
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  // Track the selection by id so the dialog always shows fresh server data.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = activities.find((a) => a.id === selectedId) ?? null;
  const setSelected = (a: ActivityWithMedia | null) => {
    setSelectedId(a?.id ?? null);
    // Closing details opened by ?open=… drops the parameter, so a reload
    // doesn't reopen them.
    if (!a && new URLSearchParams(window.location.search).has('open')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('open');
      url.searchParams.delete('t');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  };
  useEffect(() => {
    if (openId) setSelectedId(openId);
  }, [openId, openNonce]);

  const toggleSection = (status: Status) =>
    setCollapsed((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );

  const titleOf = useDisplayTitle();
  const visible = useMemo(() => {
    const text = filter.trim();

    const filtered = activities.filter((a) => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      // Matches every stored title (anime / manga: English, romaji and native).
      if (text && !matchesTitle(a.media, text)) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (sort) {
      case 'status':
        // In-progress first, then by rating (desc, null last), then title.
        sorted.sort((a, b) => {
          const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          if (byStatus !== 0) return byStatus;
          const byRating = (b.rating ?? -1) - (a.rating ?? -1);
          if (byRating !== 0) return byRating;
          return titleOf(a.media).localeCompare(titleOf(b.media));
        });
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
        break;
      case 'ranking':
        // Tier list order: S→F by position, untiered after.
        sorted.sort(compareTierOrder);
        break;
      case 'title':
        sorted.sort((a, b) => titleOf(a.media).localeCompare(titleOf(b.media)));
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
    }
    // PLANNED items follow the Up next queue order, not the sort mode's order
    // (the 'status' sort and the Planned section both rely on this).
    if (sort === 'status' || grouped) {
      const queue = orderQueue(sorted);
      let q = 0;
      return sorted.map((a) => (a.status === 'PLANNED' ? queue[q++] : a));
    }
    return sorted;
  }, [activities, filter, statusFilter, sort, grouped, titleOf]);

  // Tier list positions across the whole category (stable inside sections).
  const ranks = useMemo(() => {
    const ranked = activities
      .filter((a) => a.tier !== null && isTierEligible(a.status))
      .sort(compareTierOrder);
    return new Map(ranked.map((a, i) => [a.id, i + 1]));
  }, [activities]);

  // Title filtering shows matching titles individually, so you can find one
  // without having to expand its franchise.
  const groupingOn = groupFranchises && !filter.trim();

  // With both groupings on, a franchise is shown whole in ONE status section:
  // wherever you are in the IP (anything in progress, else anything finished…).
  const franchiseSection = useMemo(() => {
    const map = new Map<string, Status>();
    if (!groupingOn) return map;
    const members = new Map<string, Status[]>();
    for (const a of visible) {
      if (!a.franchise) continue;
      const list = members.get(a.franchise.id) ?? [];
      list.push(a.status);
      members.set(a.franchise.id, list);
    }
    for (const [id, statuses] of members) {
      if (statuses.length < 2) continue;
      const best = FRANCHISE_SECTION_PRIORITY.find((s) => statuses.includes(s));
      if (best) map.set(id, best);
    }
    return map;
  }, [visible, groupingOn]);

  const sectionOf = (a: ActivityWithMedia): Status =>
    (a.franchise && franchiseSection.get(a.franchise.id)) || a.status;

  const renderView = (items: ActivityWithMedia[]) => {
    const units = toDisplayUnits(items, groupingOn);
    const common = { units, onSelect: setSelected, expanded: expandedGroups, onToggleGroup: toggleGroup };
    return viewMode === 'grid' ? (
      <MediaGrid {...common} />
    ) : viewMode === 'compact' ? (
      <MediaCompact {...common} slug={slug} />
    ) : (
      <MediaTable {...common} ranks={sort === 'ranking' ? ranks : undefined} />
    );
  };

  // Titles already in the library, keyed by provider id, so the Add dialog can
  // show "In library" instead of offering to add them again.
  const library = useMemo(() => {
    const map: Record<string, { status: Status; rating: number | null }> = {};
    for (const a of activities) {
      map[a.media.externalId] = { status: a.status, rating: a.rating };
    }
    return map;
  }, [activities]);

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {config.label}
        </h1>
        <p className="text-sm text-muted-foreground">{config.blurb}</p>
        <p className="text-xs text-muted-foreground">
          {activities.length} {activities.length === 1 ? 'item' : 'items'}
        </p>
      </header>

      {/* Controls — a single wrapping flex row. On mobile, `order-*` regroups
          the items into thumb-friendly full-width rows (Add / filter + view /
          status + sort / Arena + AI Critic); at md+ every item reverts to the
          original single-row order, with the filter input opening the
          right-aligned group via md:ml-auto. */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchDialog
          slug={slug}
          singular={config.singular}
          library={library}
          triggerClassName="order-1 w-full md:order-none md:w-auto"
        />

        <Link
          href={`/${slug}/arena`}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'order-6 flex-1 md:order-none md:flex-none',
          )}
        >
          <Rows3 className="mr-2 h-4 w-4" />
          Tiers
        </Link>

        <RoastButton
          slug={slug}
          triggerClassName="order-7 flex-1 md:order-none md:flex-none"
        />

        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title…"
          // text-base on phones stops iOS zooming the page on focus (<16px does).
          className="order-2 h-10 min-w-0 flex-1 text-base md:order-none md:ml-auto md:h-9 md:w-44 md:flex-none md:text-sm"
        />

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="order-4 h-10 w-[calc(50%-0.25rem)] md:order-none md:h-9 md:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s, slug)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          <SelectTrigger className="order-5 h-10 w-[calc(50%-0.25rem)] md:order-none md:h-9 md:w-44">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SORT_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="order-3 flex items-center gap-2 md:order-none">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Group franchises"
            title="Group franchises"
            aria-pressed={groupFranchises}
            onClick={() => setGroupFranchises(!groupFranchises)}
            className={cn(
              'h-10 w-10 md:h-9 md:w-9',
              groupFranchises && 'bg-accent text-accent-foreground',
            )}
          >
            <Layers className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Group by status"
            title="Group by status"
            aria-pressed={grouped}
            onClick={() => setGrouped(!grouped)}
            className={cn(
              'h-10 w-10 md:h-9 md:w-9',
              grouped && 'bg-accent text-accent-foreground',
            )}
          >
            <ListTree className="h-4 w-4" />
          </Button>
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <ScoreThese slug={slug} activities={activities} defaultOpen={scoreOpen} />

      {/* Body */}
      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
          <p className="text-lg font-medium">Your {config.label.toLowerCase()} hoard is empty.</p>
          <p className="text-sm text-muted-foreground">
            Use “Add {config.singular}” to search {config.source} and start tracking.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Nothing matches your filters.
        </div>
      ) : grouped ? (
        <div className="space-y-8">
          {SECTION_ORDER.map((status) => {
            const items = visible.filter((a) => sectionOf(a) === status);
            if (items.length === 0) return null;
            return (
              <StatusSection
                key={status}
                status={status}
                slug={slug}
                count={items.length}
                collapsed={collapsed.includes(status)}
                onToggle={() => toggleSection(status)}
                action={
                  status === 'PLANNED'
                    ? { href: `/${slug}/arena?tab=queue`, label: 'Reorder' }
                    : undefined
                }
              >
                {renderView(items)}
              </StatusSection>
            );
          })}
        </div>
      ) : (
        renderView(visible)
      )}

      <CrowdPanel slug={slug} activities={activities} source={config.source} />

      <ActivityDetailDialog
        activity={selected}
        onClose={() => setSelected(null)}
        franchises={franchises}
      />
    </div>
  );
}
