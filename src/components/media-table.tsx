'use client';

import { Fragment } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronRight, ImageOff, Layers, Star } from 'lucide-react';

import { ProgressBar } from '@/components/progress-field';
import { CountdownBadge, ListenBadge, NewSeasonBadge, cardTimeToBeat } from '@/components/card-badges';
import { useDisplayTitle } from '@/components/prefs-provider';
import { GroupRating, groupCover } from '@/components/franchise-group';
import { RatingControl } from '@/components/rating-control';
import { StatusBadge } from '@/components/status-badge';
import { StatusIcon } from '@/components/status-icon';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { mediaSubtitle } from '@/lib/media-meta';
import { ownershipText } from '@/lib/ownership';
import type { ActivityWithMedia, DisplayUnit } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MediaTableProps {
  units: DisplayUnit[];
  onSelect: (a: ActivityWithMedia) => void;
  expanded: Set<string>;
  onToggleGroup: (franchiseId: string) => void;
  /** When given, shows a leading `#` column with each item's manual rank. */
  ranks?: Map<string, number>;
}

/** List view: large covers with title, subtitle, status and rating. */
export function MediaTable({ units, onSelect, expanded, onToggleGroup, ranks }: MediaTableProps) {
  return (
    <div className="rounded-lg border border-border">
      {/* min-w keeps the columns readable on phones — the Table primitive's
          own overflow-auto wrapper provides the horizontal scroll. */}
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow>
            {ranks && <TableHead className="w-12 text-center">#</TableHead>}
            <TableHead className="w-20" />
            <TableHead>Title</TableHead>
            <TableHead className="w-36">Status</TableHead>
            <TableHead className="w-24">Rating</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((unit) => {
            if (unit.kind === 'item') {
              return (
                <ItemRow key={unit.activity.id} activity={unit.activity} onSelect={onSelect} ranks={ranks} />
              );
            }
            const { franchise, members } = unit;
            const open = expanded.has(franchise.id);
            const cover = groupCover(franchise, members);
            const Chevron = open ? ChevronDown : ChevronRight;
            return (
              <Fragment key={franchise.id}>
                <TableRow
                  onClick={() => onToggleGroup(franchise.id)}
                  aria-expanded={open}
                  className="cursor-pointer bg-muted/20"
                >
                  {ranks && <TableCell />}
                  <TableCell className="py-2.5">
                    <div className="relative h-24 w-16">
                      <span className="absolute inset-0 translate-x-1.5 -translate-y-1.5 rounded-md border border-border bg-muted" aria-hidden />
                      <div className="relative h-full w-full overflow-hidden rounded-md bg-muted ring-1 ring-border">
                        {cover ? (
                          <Image src={cover} alt={franchise.name} fill sizes="64px" className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageOff className="h-5 w-5" aria-hidden />
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="text-base font-semibold leading-tight">{franchise.name}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{members.length} titles</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => (
                        <StatusIcon key={m.id} status={m.status} className="h-3.5 w-3.5" />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <GroupRating franchise={franchise} members={members} />
                  </TableCell>
                </TableRow>
                {open &&
                  members.map((a) => (
                    <ItemRow key={a.id} activity={a} onSelect={onSelect} ranks={ranks} nested />
                  ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ItemRow({
  activity,
  onSelect,
  ranks,
  nested,
}: {
  activity: ActivityWithMedia;
  onSelect: (a: ActivityWithMedia) => void;
  ranks?: Map<string, number>;
  nested?: boolean;
}) {
  const { media } = activity;
  const title = useDisplayTitle()(media);
  const subtitle = mediaSubtitle(media, activity.category);
  const dropped = activity.status === 'DROPPED';
  return (
    <TableRow onClick={() => onSelect(activity)} className={cn('cursor-pointer', nested && 'bg-muted/10')}>
      {ranks && (
        <TableCell className="text-center text-base font-semibold tabular-nums text-muted-foreground">
          {ranks.get(activity.id) ?? '—'}
        </TableCell>
      )}
      <TableCell className={cn('py-2.5', nested && 'pl-6')}>
        <div className="relative h-24 w-16 overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-border">
          {media.imageUrl ? (
            <Image
              src={media.imageUrl}
              alt={title}
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
          <span className="text-base font-medium leading-tight">{title}</span>
          {activity.favorite && (
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Favorite" />
          )}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {[media.year, subtitle, cardTimeToBeat(activity), ownershipText(activity)].filter(Boolean).join(' · ')}
        </div>
        <CountdownBadge activity={activity} className="mt-1.5" />
        <NewSeasonBadge activity={activity} className="mt-1.5" />
        <ListenBadge activity={activity} className="mt-1.5" />
        <ProgressBar activity={activity} className="mt-1.5 max-w-48" />
      </TableCell>
      <TableCell>
        <StatusBadge status={activity.status} slug={activity.category} />
      </TableCell>
      <TableCell>
        <RatingControl value={activity.rating} />
      </TableCell>
    </TableRow>
  );
}
