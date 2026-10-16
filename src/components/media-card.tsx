'use client';

import Image from 'next/image';
import { ImageOff, Star } from 'lucide-react';

import { RatingControl } from '@/components/rating-control';
import { StatusBadge } from '@/components/status-badge';
import type { ActivityWithMedia } from '@/lib/types';

interface MediaCardProps {
  activity: ActivityWithMedia;
  onClick: () => void;
}

/**
 * A clickable poster card: 2:3 poster (or placeholder), title, year, the status
 * badge, an optional read-only rating, and a favorite star.
 */
export function MediaCard({ activity, onClick }: MediaCardProps) {
  const { media } = activity;

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
            alt={media.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-8 w-8" aria-hidden />
          </div>
        )}
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
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight" title={media.title}>
          {media.title}
        </h3>
        {media.year != null && (
          <p className="text-xs text-muted-foreground">{media.year}</p>
        )}
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <StatusBadge status={activity.status} slug={activity.category} />
          {activity.rating != null && (
            <RatingControl value={activity.rating} readOnly />
          )}
        </div>
      </div>
    </button>
  );
}
