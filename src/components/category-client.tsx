'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ActivityDetailDialog } from '@/components/activity-detail-dialog';
import { MediaCompact } from '@/components/media-compact';
import { MediaGrid } from '@/components/media-grid';
import { MediaTable } from '@/components/media-table';
import { useDisplayTitle, usePrefs } from '@/components/prefs-provider';
import { StatusSection } from '@/components/status-section';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { SectionToolbar } from '@/components/section/section-toolbar';
import { useSectionFilters } from '@/components/section/use-section-filters';
import type { CategoryConfig, CategorySlug } from '@/lib/categories';
import {
  applySectionFilters,
  franchiseSections,
  isStatusList,
  isViewMode,
  SECTION_ORDER,
  sectionPrefKey,
} from '@/lib/section-filters';
import type { Status } from '@/lib/status';
import { ownershipChoices } from '@/lib/ownership';
import { countTags } from '@/lib/tags';
import { titleHref } from '@/lib/title-href';
import { compareTierOrder, isTierEligible } from '@/lib/tiers';
import { toDisplayUnits, type ActivityWithMedia, type ViewMode } from '@/lib/types';

interface CategoryClientProps {
  slug: CategorySlug;
  config: CategoryConfig;
  activities: ActivityWithMedia[];
  /** The user's franchises, for the detail dialog's franchise picker. */
  franchises: { id: string; name: string }[];
  /** Open this activity's popup on arrival (`?open=<id>`: the palette, notifications, links). */
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
  const sectionFilters = useSectionFilters(slug, initialTags);
  const { filters } = sectionFilters;
  const { sort, grouped, groupFranchises } = filters;
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
  // Full page title view: a card opens the title's page. `?open=` normally
  // redirects on the server; it lands here only when the switch to Full
  // page hasn't been saved yet, so it moves on from here (an id that isn't
  // in this section stays put, as in popup mode).
  const router = useRouter();
  const { titleView } = usePrefs();
  const select = (a: ActivityWithMedia) => {
    if (titleView === 'page') router.push(titleHref(slug, a.id, 'page'));
    else setSelected(a);
  };
  useEffect(() => {
    if (!openId) return;
    if (titleView !== 'page') setSelectedId(openId);
    else if (activities.some((a) => a.id === openId)) router.replace(titleHref(slug, openId, 'page'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new ?open= (or nonce) opens
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
    const common = { units, onSelect: select, expanded: expandedGroups, onToggleGroup: toggleGroup, inStatusSection: grouped };
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
        <p className="truncate text-xs text-muted-foreground">
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

      <SectionToolbar
        slug={slug}
        config={config}
        library={library}
        text={filter}
        onText={setFilter}
        filters={sectionFilters}
        ownedChoices={ownedChoices}
        sectionTags={sectionTags}
        view={viewMode}
        onView={setViewMode}
      />

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
