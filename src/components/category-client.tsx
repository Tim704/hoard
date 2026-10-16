'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ListOrdered, ListTree } from 'lucide-react';

import { ActivityDetailDialog } from '@/components/activity-detail-dialog';
import { MediaCompact } from '@/components/media-compact';
import { MediaGrid } from '@/components/media-grid';
import { MediaTable } from '@/components/media-table';
import { RoastButton } from '@/components/roast-button';
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
import type { ActivityWithMedia, ViewMode } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CategoryClientProps {
  slug: CategorySlug;
  config: CategoryConfig;
  activities: ActivityWithMedia[];
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

/** Section order when grouping by status: in progress first, dropped last. */
const SECTION_ORDER = [...STATUSES].sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);

const SORT_LABEL: Record<SortMode, string> = {
  status: 'Status',
  recent: 'Recently added',
  rating: 'Highest rated',
  ranking: 'My ranking',
  title: 'Title (A–Z)',
};

/**
 * The interactive shell for a category page: search/add, filter, sort, switch
 * between grid and table views, and open the detail dialog for any item.
 */
export function CategoryClient({ slug, config, activities }: CategoryClientProps) {
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
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selected, setSelected] = useState<ActivityWithMedia | null>(null);

  const toggleSection = (status: Status) =>
    setCollapsed((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );

  const visible = useMemo(() => {
    const text = filter.trim().toLowerCase();

    const filtered = activities.filter((a) => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (text && !a.media.title.toLowerCase().includes(text)) return false;
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
          return a.media.title.localeCompare(b.media.title);
        });
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
        break;
      case 'ranking':
        // Manual ranking first (ascending position), unranked after by Elo.
        sorted.sort((a, b) => {
          if (a.rankOrder != null && b.rankOrder != null) return a.rankOrder - b.rankOrder;
          if (a.rankOrder != null) return -1;
          if (b.rankOrder != null) return 1;
          return b.elo - a.elo;
        });
        break;
      case 'title':
        sorted.sort((a, b) => a.media.title.localeCompare(b.media.title));
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
    }
    return sorted;
  }, [activities, filter, statusFilter, sort]);

  // Manual rank numbers across the whole category (stable inside sections).
  const ranks = useMemo(() => {
    const ranked = activities
      .filter((a) => a.rankOrder != null)
      .sort((a, b) => (a.rankOrder as number) - (b.rankOrder as number));
    return new Map(ranked.map((a, i) => [a.id, i + 1]));
  }, [activities]);

  const renderView = (items: ActivityWithMedia[]) =>
    viewMode === 'grid' ? (
      <MediaGrid activities={items} onSelect={setSelected} />
    ) : viewMode === 'compact' ? (
      <MediaCompact activities={items} slug={slug} onSelect={setSelected} />
    ) : (
      <MediaTable activities={items} onSelect={setSelected} ranks={sort === 'ranking' ? ranks : undefined} />
    );

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
          triggerClassName="order-1 w-full md:order-none md:w-auto"
        />

        <Link
          href={`/${slug}/arena`}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'order-6 flex-1 md:order-none md:flex-none',
          )}
        >
          <ListOrdered className="mr-2 h-4 w-4" />
          Rank
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
            const items = visible.filter((a) => a.status === status);
            if (items.length === 0) return null;
            return (
              <StatusSection
                key={status}
                status={status}
                slug={slug}
                count={items.length}
                collapsed={collapsed.includes(status)}
                onToggle={() => toggleSection(status)}
              >
                {renderView(items)}
              </StatusSection>
            );
          })}
        </div>
      ) : (
        renderView(visible)
      )}

      <ActivityDetailDialog activity={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
