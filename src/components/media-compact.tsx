'use client';

import { ChevronRight, Layers } from 'lucide-react';

import { FranchiseGroupHeader, GroupRating } from '@/components/franchise-group';
import { StatusIcon } from '@/components/status-icon';
import type { CategorySlug } from '@/lib/categories';
import { statusLabel } from '@/lib/status';
import type { ActivityWithMedia, DisplayUnit } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MediaCompactProps {
  units: DisplayUnit[];
  slug: CategorySlug;
  onSelect: (a: ActivityWithMedia) => void;
  expanded: Set<string>;
  onToggleGroup: (franchiseId: string) => void;
}

const COLS = 'grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2 xl:grid-cols-3';

/**
 * A space-efficient, imageless overview: a multi-column list where each row is
 * a clickable button showing a status icon, the title, year + status label, and
 * the rating. Franchises collapse into one row that expands to a full-width block.
 */
export function MediaCompact({ units, slug, onSelect, expanded, onToggleGroup }: MediaCompactProps) {
  if (units.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  }

  return (
    <ul className={COLS}>
      {units.map((unit) => {
        if (unit.kind === 'item') {
          return (
            <li key={unit.activity.id}>
              <CompactRow activity={unit.activity} slug={slug} onSelect={onSelect} />
            </li>
          );
        }
        const { franchise, members } = unit;
        if (expanded.has(franchise.id)) {
          return (
            <li
              key={franchise.id}
              className="col-span-full my-2 space-y-1 rounded-xl border border-dashed border-border bg-muted/20 p-3"
            >
              <FranchiseGroupHeader
                franchise={franchise}
                members={members}
                onToggle={() => onToggleGroup(franchise.id)}
              />
              <ul className={cn(COLS, 'pt-1')}>
                {members.map((a) => (
                  <li key={a.id}>
                    <CompactRow activity={a} slug={slug} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            </li>
          );
        }
        return (
          <li key={franchise.id}>
            <button
              type="button"
              onClick={() => onToggleGroup(franchise.id)}
              aria-expanded={false}
              className="flex w-full items-center gap-3 rounded-md border border-dashed border-border px-2.5 py-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-2.5"
            >
              <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{franchise.name}</span>
                <span className="block text-xs text-muted-foreground">{members.length} titles</span>
              </span>
              <GroupRating franchise={franchise} members={members} className="shrink-0" />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CompactRow({
  activity,
  slug,
  onSelect,
}: {
  activity: ActivityWithMedia;
  slug: CategorySlug;
  onSelect: (a: ActivityWithMedia) => void;
}) {
  const { media, status, rating } = activity;
  return (
    <button
      type="button"
      onClick={() => onSelect(activity)}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border border-transparent px-2.5 py-3 text-left transition-colors hover:border-border hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-2.5',
        status === 'DROPPED' && 'opacity-70',
      )}
    >
      <StatusIcon status={status} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={media.title}>
          {media.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[media.year, statusLabel(status, slug)].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span
        className={cn(
          'w-12 shrink-0 text-right text-sm tabular-nums',
          rating != null ? 'font-medium text-amber-600 dark:text-amber-300' : 'text-muted-foreground',
        )}
      >
        {rating != null ? `${rating}/10` : '—'}
      </span>
    </button>
  );
}
