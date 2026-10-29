'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Layers, ListTree, Rows3 } from 'lucide-react';

import { ActivityDetailDialog } from '@/components/activity-detail-dialog';
import { MediaCompact } from '@/components/media-compact';
import { MediaGrid } from '@/components/media-grid';
import { MediaTable } from '@/components/media-table';
import { useDisplayTitle } from '@/components/prefs-provider';
import { RoastButton } from '@/components/roast-button';
import { SearchDialog } from '@/components/search-dialog';
import { StatusSection } from '@/components/status-section';
import { TagFilter } from '@/components/tag-filter';
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
import { useSectionFilters } from '@/components/section/use-section-filters';
import type { CategoryConfig, CategorySlug } from '@/lib/categories';
import {
  applySectionFilters,
  franchiseSections,
  isStatusList,
  isViewMode,
  SECTION_ORDER,
  sectionPrefKey,
  SORT_LABEL,
  SORT_MODES,
  type SortMode,
  type StatusFilter,
} from '@/lib/section-filters';
import { STATUSES, statusLabel, type Status } from '@/lib/status';
import { hasOwnership, ownershipChoices } from '@/lib/ownership';
import { countTags } from '@/lib/tags';
import { compareTierOrder, isTierEligible } from '@/lib/tiers';
import { toDisplayUnits, type ActivityWithMedia, type ViewMode } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CategoryClientProps {
  slug: CategorySlug;
  config: CategoryConfig;
  activities: ActivityWithMedia[];
  /** The user's franchises, for the detail dialog's franchise picker. */
  franchises: { id: string; name: string }[];
  /** Open this activity's details on arrival (`?open=<id>`, from the Cmd/Ctrl+K palette). */
  openId?: string;
  /** Changes with every palette pick (`?t=`), so the same title reopens. */
  openNonce?: string;
  /** Tags to filter by on arrival (`?tag=a&tag=b`, from the /tags page). */
  initialTags?: string[];
}

/**
 * The interactive shell for a category page: search/add, filter, sort, switch
 * between grid and table views, and open the detail dialog for any item.
 */
export function CategoryClient({
  slug,
  config,
  activities,
  franchises,
  openId,
  openNonce,
  initialTags = [],
}: CategoryClientProps) {
  // View preferences persist per category across visits (sort and the two
  // groupings inside useSectionFilters).
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(sectionPrefKey(slug, 'view'), 'grid', isViewMode);
  const [collapsed, setCollapsed] = usePersistentState<Status[]>(sectionPrefKey(slug, 'collapsed'), [], isStatusList);
  const { filters, set } = useSectionFilters(slug, initialTags);
  const { sort, grouped, groupFranchises, status: statusFilter, owned: ownedFilter, tags: tagFilter } = filters;
  const setSort = (v: SortMode) => set('sort', v);
  const setGrouped = (v: boolean) => set('grouped', v);
  const setGroupFranchises = (v: boolean) => set('groupFranchises', v);
  const setStatusFilter = (v: StatusFilter) => set('status', v);
  const setOwnedFilter = (v: string) => set('owned', v);
  const setTagFilter = (v: string[]) => set('tags', v);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [filter, setFilter] = useState('');
  const sectionTags = useMemo(
    () => countTags(activities.map((a) => ({ tags: a.tags, section: slug }))).map((t) => t.tag),
    [activities, slug],
  );
  const ownedChoices = useMemo(() => ownershipChoices(slug, activities), [slug, activities]);
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
  const visible = useMemo(
    () => applySectionFilters(activities, filters, filter, titleOf),
    [activities, filters, filter, titleOf],
  );

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

  // With both groupings on, a franchise is shown whole in ONE status section.
  const franchiseSection = useMemo(
    () => (groupingOn ? franchiseSections(visible) : new Map<string, Status>()),
    [visible, groupingOn],
  );

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
          {slug === 'anime' && (
            <>
              {' · '}
              <Link href="/anime/season" className="underline underline-offset-2 hover:text-foreground">
                Browse this season
              </Link>
            </>
          )}
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
            {SORT_MODES.map((s) => (
              <SelectItem key={s} value={s}>
                {SORT_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasOwnership(slug) && (slug !== 'games' || ownedChoices.length > 0) && (
          <Select value={ownedFilter} onValueChange={setOwnedFilter}>
            <SelectTrigger
              aria-label={slug === 'games' ? 'Owned on' : 'Format'}
              className="order-5 h-10 w-full md:order-none md:h-9 md:w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{slug === 'games' ? 'Any platform' : 'Any format'}</SelectItem>
              {ownedChoices.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
              <SelectItem value="NONE">{slug === 'games' ? 'No platform set' : 'No format set'}</SelectItem>
            </SelectContent>
          </Select>
        )}

        {(sectionTags.length > 0 || tagFilter.length > 0) && (
          <TagFilter
            tags={sectionTags}
            selected={tagFilter}
            onChange={setTagFilter}
            className="order-5 w-full md:order-none md:w-auto"
          />
        )}

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

      <ActivityDetailDialog
        activity={selected}
        onClose={() => setSelected(null)}
        franchises={franchises}
      />
    </div>
  );
}
