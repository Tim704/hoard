'use client';

import Image from 'next/image';
import { ImageOff, Star } from 'lucide-react';

import { RatingControl } from '@/components/rating-control';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { mediaSubtitle } from '@/lib/media-meta';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MediaTableProps {
  activities: ActivityWithMedia[];
  onSelect: (a: ActivityWithMedia) => void;
  /** Show a leading rank `#` column (used for the ranking sort). */
  showRank?: boolean;
}

/** List view: large covers with title, subtitle, status and rating. */
export function MediaTable({ activities, onSelect, showRank }: MediaTableProps) {
  return (
    <div className="rounded-lg border border-border">
      {/* min-w keeps the columns readable on phones — the Table primitive's
          own overflow-auto wrapper provides the horizontal scroll. */}
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow>
            {showRank && <TableHead className="w-12 text-center">#</TableHead>}
            <TableHead className="w-20" />
            <TableHead>Title</TableHead>
            <TableHead className="w-36">Status</TableHead>
            <TableHead className="w-24">Rating</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity, index) => {
            const { media } = activity;
            const subtitle = mediaSubtitle(media, activity.category);
            const dropped = activity.status === 'DROPPED';
            return (
              <TableRow
                key={activity.id}
                onClick={() => onSelect(activity)}
                className="cursor-pointer"
              >
                {showRank && (
                  <TableCell className="text-center text-base font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                )}
                <TableCell className="py-2.5">
                  <div className="relative h-24 w-16 overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-border">
                    {media.imageUrl ? (
                      <Image
                        src={media.imageUrl}
                        alt={media.title}
                        fill
                        sizes="64px"
                        className={cn('object-cover', dropped && 'opacity-60 grayscale')}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-5 w-5" aria-hidden />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-medium leading-tight">{media.title}</span>
                    {activity.favorite && (
                      <Star
                        className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                        aria-label="Favorite"
                      />
                    )}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {[media.year, subtitle].filter(Boolean).join(' · ')}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={activity.status} slug={activity.category} />
                </TableCell>
                <TableCell>
                  <RatingControl value={activity.rating} readOnly />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
