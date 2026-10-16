'use client';

import Image from 'next/image';
import { ImageOff } from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ActivityWithMedia } from '@/lib/types';

interface MediaTableProps {
  activities: ActivityWithMedia[];
  onSelect: (a: ActivityWithMedia) => void;
  /** Show a leading rank `#` column (used for the elo-sorted ranking view). */
  showRank?: boolean;
}

/** Dense, sortable-looking table view of a category's activities. */
export function MediaTable({ activities, onSelect, showRank }: MediaTableProps) {
  return (
    <div className="rounded-lg border border-border">
      {/* min-w keeps the columns readable on phones — the Table primitive's
          own overflow-auto wrapper provides the horizontal scroll. */}
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow>
            {showRank && <TableHead className="w-12 text-center">#</TableHead>}
            <TableHead className="w-12" />
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24">Rating</TableHead>
            <TableHead className="w-20 text-right">Elo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity, index) => {
            const { media } = activity;
            return (
              <TableRow
                key={activity.id}
                onClick={() => onSelect(activity)}
                className="cursor-pointer"
              >
                {showRank && (
                  <TableCell className="text-center text-sm font-semibold text-muted-foreground">
                    {index + 1}
                  </TableCell>
                )}
                <TableCell>
                  <div className="relative h-12 w-8 overflow-hidden rounded bg-muted">
                    {media.imageUrl ? (
                      <Image
                        src={media.imageUrl}
                        alt={media.title}
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-3.5 w-3.5" aria-hidden />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium leading-tight">{media.title}</div>
                  {media.year != null && (
                    <div className="text-xs text-muted-foreground">{media.year}</div>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={activity.status} slug={activity.category} />
                </TableCell>
                <TableCell className="text-sm">
                  {activity.rating != null ? (
                    <span className="font-medium text-amber-300">{activity.rating}/10</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {Math.round(activity.elo)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
