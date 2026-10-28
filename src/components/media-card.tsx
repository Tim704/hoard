'use client';

import Image from 'next/image';
import { ImageOff, Star } from 'lucide-react';

import { useDisplayTitle } from '@/components/prefs-provider';
import { ProgressBar } from '@/components/progress-field';
import { RatingControl } from '@/components/rating-control';
import { StatusBadge } from '@/components/status-badge';
import { STATUS_BASE_LABEL, STATUS_ICON, type Status } from '@/lib/status';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MediaCardProps {
  activity: ActivityWithMedia;
  onClick: () => void;
}

/** Icon colour for the chip sitting on the (always dark) poster overlay. */
const CHIP_TEXT: Record<Status, string> = {
  CONSUMING: 'text-emerald-400',
  PLANNED: 'text-sky-400',
  COMPLETED: 'text-violet-400',
  ON_HOLD: 'text-amber-400',
  RETIRED: 'text-slate-300',
  DROPPED: 'text-rose-400',
};

/**
 * A clickable poster card: 2:3 poster (or placeholder) with a status icon chip,
 * title, year, the status badge, an optional read-only rating, and a favorite
 * star, plus a progress bar while ongoing. Dropped items render their poster
 * greyed out (Retired ones don't: they were set aside, not abandoned).
 */
export function MediaCard({ activity, onClick }: MediaCardProps) {
  const { media, status } = activity;
  const title = useDisplayTitle()(media);
  const dropped = status === 'DROPPED';
  const Icon = STATUS_ICON[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-black/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {media.imageUrl ? (
          <Image
            src={media.imageUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
            className={cn(
              'object-cover transition-all duration-300 group-hover:scale-105',
              dropped &&
                'opacity-60 grayscale group-hover:opacity-90 group-hover:grayscale-0',
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-8 w-8" aria-hidden />
          </div>
        )}
        <span
          className={cn(
            'absolute left-1.5 top-1.5 rounded-full bg-black/65 p-1 backdrop-blur-sm',
            CHIP_TEXT[status],
          )}
          title={STATUS_BASE_LABEL[status]}
        >
          <Icon
            className={cn('h-3.5 w-3.5', status === 'CONSUMING' && 'fill-current')}
            aria-hidden
          />
        </span>
        {activity.favorite && (
          <span
            className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-amber-300"
            title="Favorite"
          >
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight" title={title}>
          {title}
        </h3>
        {media.year != null && (
          <p className="text-xs text-muted-foreground">{media.year}</p>
        )}
        <ProgressBar activity={activity} />
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <StatusBadge status={status} slug={activity.category} />
          {activity.rating != null && (
            <RatingControl value={activity.rating} />
          )}
        </div>
      </div>
    </button>
  );
}
