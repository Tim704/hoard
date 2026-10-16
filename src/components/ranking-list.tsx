import Image from 'next/image';
import { ImageOff, Star, Trophy } from 'lucide-react';

import type { ActivityWithMedia } from '@/lib/types';

interface RankingListProps {
  /** Already sorted by Elo descending (the dynamic 1..N ranking). */
  items: ActivityWithMedia[];
}

/**
 * The dynamic leaderboard for a category. Items arrive pre-sorted by Elo, so we
 * simply render them 1..N. The visible 1–10 rating is shown alongside the muted
 * Elo score that actually drives the order.
 */
export function RankingList({ items }: RankingListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Nothing ranked yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Rate some items and run a few duels to build your leaderboard.
        </p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {items.map((activity, index) => {
        const { media } = activity;
        return (
          <li
            key={activity.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
          >
            <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
              {index + 1}
            </span>

            <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
              {media.imageUrl ? (
                <Image
                  src={media.imageUrl}
                  alt={media.title}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-snug">{media.title}</p>
              {media.year != null && (
                <p className="text-xs text-muted-foreground">{media.year}</p>
              )}
            </div>

            {activity.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-sm">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                {activity.rating}/10
              </span>
            )}

            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(activity.elo)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
