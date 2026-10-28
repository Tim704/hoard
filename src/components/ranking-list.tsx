import Image from 'next/image';
import { ImageOff, Star, Trophy } from 'lucide-react';

import { MediaTitle, Score } from '@/components/prefs-provider';
import type { ActivityWithMedia } from '@/lib/types';

interface RankingListProps {
  /** Already sorted best-first (tier list S→F, or rating then Elo). */
  items: ActivityWithMedia[];
}

/**
 * The read-only leaderboard beside the Arena. Items arrive pre-sorted, so we
 * simply render them 1..N with the visible 1–10 rating, how many duels each
 * has fought (4.3: how settled its place is) and the muted Elo.
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
              <p className="truncate font-medium leading-snug">
                <MediaTitle media={media} />
              </p>
              <p className="text-xs text-muted-foreground">
                {[media.year, `${activity.duels} ${activity.duels === 1 ? 'duel' : 'duels'}`]
                  .filter((x) => x != null)
                  .join(' · ')}
              </p>
            </div>

            {activity.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-sm">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                <Score value={activity.rating} outOf star={false} />
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
