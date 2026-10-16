'use client';

import type { CategorySlug } from '@/lib/categories';
import { statusLabel, STATUS_DOT_CLASS } from '@/lib/status';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MediaCompactProps {
  activities: ActivityWithMedia[];
  slug: CategorySlug;
  onSelect: (a: ActivityWithMedia) => void;
}

/**
 * A super space-efficient, imageless overview: a dense multi-column list where
 * each row is a clickable button showing a status dot, the title, a tiny status
 * label, and the rating. Built for scanning a large library at a glance.
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
    <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
      {activities.map((activity) => {
        const { media, status, rating } = activity;
        return (
          <li
            key={activity.id}
            className="border-b border-border/60 last:border-b-0"
          >
            <button
              type="button"
              onClick={() => onSelect(activity)}
              className="flex w-full items-center gap-2.5 rounded-sm py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-1.5"
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  STATUS_DOT_CLASS[status],
                )}
                aria-hidden
              />
              <span
                className="flex-1 truncate text-sm font-medium"
                title={media.title}
              >
                {media.title}
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {statusLabel(status, slug)}
              </span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {rating != null ? `${rating}/10` : '—'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
