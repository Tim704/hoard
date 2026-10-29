'use client';

import { Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ImageOff, Layers, Star } from 'lucide-react';

import { CardBadgePill, useCardBadge } from '@/components/card-badges';
import { useDisplayTitle, useLayout } from '@/components/prefs-provider';
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
import type { CardStyle } from '@/lib/layouts';
import { mediaSubtitle } from '@/lib/media-meta';
import { statusLabel } from '@/lib/status';
import type { ActivityWithMedia, DisplayUnit } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MediaTableProps {
  units: DisplayUnit[];
  onSelect: (a: ActivityWithMedia) => void;
  /** A title's page (Full page title view): the title cell links there. */
  hrefFor?: (a: ActivityWithMedia) => string | undefined;
  expanded: Set<string>;
  onToggleGroup: (franchiseId: string) => void;
  /** When given, shows a leading `#` column with each item's manual rank. */
  ranks?: Map<string, number>;
  /** Under a status heading (rows that show no status needn't name it). */
  inStatusSection?: boolean;
}

/** Which columns the list view shows, per the layout's card detail. */
const COLUMNS: Record<CardStyle, { status: boolean; badge: boolean; rating: boolean; table: string }> = {
  // Classic: the columns before layouts.
  plain: { status: true, badge: false, rating: true, table: 'min-w-[560px]' },
  // Minimal: the cover and the title alone.
  poster: { status: false, badge: false, rating: false, table: '' },
  // Organised: plus one badge column (pickCardBadge).
  'one-badge': { status: true, badge: true, rating: true, table: 'min-w-[680px]' },
  // Fresh: the Classic columns on darker rows.
  cinematic: { status: true, badge: false, rating: true, table: 'min-w-[560px]' },
};

/**
 * List view: large covers with title, subtitle, status and rating, showing
 * as much as the layout's cards do (`useLayout().card`).
 */
export function MediaTable({ units, onSelect, hrefFor, expanded, onToggleGroup, ranks, inStatusSection }: MediaTableProps) {
  const style = useLayout().card;
  const cols = COLUMNS[style];
  const dark = style === 'cinematic';
  return (
    <div
      data-list={style}
      className={cn('rounded-lg border border-border', dark && 'rounded-xl border-white/10 bg-black/40')}
    >
      {/* min-w keeps the columns readable on phones — the Table primitive's
          own overflow-auto wrapper provides the horizontal scroll. */}
      <Table className={cols.table}>
        <TableHeader>
          <TableRow className={cn(dark && 'border-white/10 hover:bg-transparent')}>
            {ranks && <TableHead className="w-12 text-center">#</TableHead>}
            <TableHead className="w-20" />
            <TableHead>Title</TableHead>
            {cols.status && <TableHead className="w-36">Status</TableHead>}
            {cols.badge && (
              <TableHead className="w-40">
                <span className="sr-only">Now</span>
              </TableHead>
            )}
            {cols.rating && <TableHead className="w-24">Rating</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((unit) => {
            if (unit.kind === 'item') {
              return (
                <ItemRow
                  key={unit.activity.id}
                  activity={unit.activity}
                  onSelect={onSelect}
                  href={hrefFor?.(unit.activity)}
                  ranks={ranks}
                  style={style}
                  inStatusSection={inStatusSection}
                />
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
                  className={cn('cursor-pointer bg-muted/20', dark && 'border-white/5 bg-white/[0.03] hover:bg-white/[0.06]')}
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
                  {cols.status && (
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {members.map((m) => (
                          <StatusIcon key={m.id} status={m.status} className="h-3.5 w-3.5" />
                        ))}
                      </div>
                    </TableCell>
                  )}
                  {cols.badge && <TableCell />}
                  {cols.rating && (
                    <TableCell>
                      <GroupRating franchise={franchise} members={members} />
                    </TableCell>
                  )}
                </TableRow>
                {open &&
                  members.map((a) => (
                    <ItemRow
                      key={a.id}
                      activity={a}
                      onSelect={onSelect}
                      href={hrefFor?.(a)}
                      ranks={ranks}
                      style={style}
                      inStatusSection={inStatusSection}
                      nested
                    />
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
  href,
  ranks,
  style,
  inStatusSection,
  nested,
}: {
  activity: ActivityWithMedia;
  onSelect: (a: ActivityWithMedia) => void;
  /** The title's page: the title is a link to it (the rest of the row still opens it on a click). */
  href?: string;
  ranks?: Map<string, number>;
  style: CardStyle;
  inStatusSection?: boolean;
  nested?: boolean;
}) {
  const { media } = activity;
  const title = useDisplayTitle()(media);
  const badge = useCardBadge(activity);
  const cols = COLUMNS[style];
  const dark = style === 'cinematic';
  const subtitle = mediaSubtitle(media, activity.category);
  const dropped = activity.status === 'DROPPED';
  return (
    <TableRow
      onClick={() => onSelect(activity)}
      className={cn(
        'cursor-pointer',
        nested && 'bg-muted/10',
        dark && 'border-white/5 hover:bg-white/[0.05]',
        dark && nested && 'bg-white/[0.02]',
      )}
    >
      {ranks && (
        <TableCell className="text-center text-base font-semibold tabular-nums text-muted-foreground">
          {ranks.get(activity.id) ?? '—'}
        </TableCell>
      )}
      <TableCell className={cn('py-2.5', nested && 'pl-6', style === 'poster' && 'py-3')}>
        <div
          className={cn(
            'relative h-24 w-16 overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-border',
            dark && 'rounded-lg shadow-md shadow-black/50 ring-white/10',
          )}
        >
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
          {href ? (
            <Link
              href={href}
              // The row's own click would navigate a second time (or, with a
              // modifier key, in this tab as well as the new one).
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'rounded-sm text-base font-medium leading-tight hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                dark && 'font-display font-semibold',
              )}
            >
              {title}
            </Link>
          ) : (
            <span className={cn('text-base font-medium leading-tight', dark && 'font-display font-semibold')}>{title}</span>
          )}
          {activity.favorite && style !== 'poster' && (
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Favorite" />
          )}
        </div>
        <div className={cn('mt-1 text-sm text-muted-foreground', style === 'poster' && 'text-xs')}>
          {[media.year, subtitle].filter(Boolean).join(' · ')}
        </div>
        {/* Minimal shows no status column: name it when no status heading does. */}
        {!cols.status && !inStatusSection && (
          <span className="sr-only">{statusLabel(activity.status, activity.category)}</span>
        )}
      </TableCell>
      {cols.status && (
        <TableCell>
          {style === 'one-badge' ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <StatusIcon status={activity.status} className="h-3.5 w-3.5" decorative />
              {statusLabel(activity.status, activity.category)}
            </span>
          ) : (
            <StatusBadge status={activity.status} slug={activity.category} />
          )}
        </TableCell>
      )}
      {cols.badge && <TableCell>{badge && <CardBadgePill badge={badge} />}</TableCell>}
      {cols.rating && (
        <TableCell>
          <RatingControl value={activity.rating} />
        </TableCell>
      )}
    </TableRow>
  );
}
