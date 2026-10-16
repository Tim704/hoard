'use client';

import { StatusIcon } from '@/components/status-icon';
import type { CategorySlug } from '@/lib/categories';
import { statusLabel } from '@/lib/status';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MediaCompactProps {
  activities: ActivityWithMedia[];
  slug: CategorySlug;
  onSelect: (a: ActivityWithMedia) => void;
}

/**
 * A space-efficient, imageless overview: a multi-column list where each row is
 * a clickable button showing a status icon, the title, year + status label, and
 * the rating. Built for scanning a large library at a glance.
 */
export function MediaCompact({ activities, slug, onSelect }: MediaCompactProps) {
  if (activities.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Nothing here yet.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
      {activities.map((activity) => {
        const { media, status, rating } = activity;
        return (
          <li key={activity.id}>
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
                  rating != null
                    ? 'font-medium text-amber-600 dark:text-amber-300'
                    : 'text-muted-foreground',
                )}
              >
                {rating != null ? `${rating}/10` : '—'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
