'use client';

import Image from 'next/image';
import { ImageOff, Star } from 'lucide-react';

import { CardBadgePill, useCardBadge } from '@/components/card-badges';
import { useDisplayTitle, useLayout, useScoreFormat } from '@/components/prefs-provider';
import { RatingControl } from '@/components/rating-control';
import { StatusBadge } from '@/components/status-badge';
import { StatusIcon } from '@/components/status-icon';
import { mediaSubtitle } from '@/lib/media-meta';
import { progressFraction, progressTotal, tracksProgress } from '@/lib/progress';
import { STATUS_BASE_LABEL, STATUS_ICON, statusLabel, type Status } from '@/lib/status';
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

const SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw';

/**
 * A clickable poster card. How much it shows depends on the layout
 * (`useLayout().card`, src/lib/layouts.ts):
 * - plain (Classic): the original card: status chip, favourite star, title,
 *   year, status badge and rating;
 * - poster (Minimal): the poster and title, the year and creator quietly below;
 * - one-badge (Organised): a tidy card with at most one badge (pickCardBadge);
 * - cinematic (Fresh): the poster fills the card, the title on a gradient.
 * Dropped titles show their poster greyed out (Retired ones don't: they were
 * set aside, not abandoned).
 */
export function MediaCard(props: MediaCardProps) {
  switch (useLayout().card) {
    case 'poster':
      return <PosterCard {...props} />;
    case 'one-badge':
      return <OneBadgeCard {...props} />;
    case 'cinematic':
      return <CinematicCard {...props} />;
    default:
      return <PlainCard {...props} />;
  }
}

/** The poster image (or a placeholder), filling its box. */
function Poster({
  activity,
  title,
  className,
  iconClassName = 'h-8 w-8',
}: {
  activity: ActivityWithMedia;
  title: string;
  className?: string;
  iconClassName?: string;
}) {
  const { media, status } = activity;
  if (!media.imageUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <ImageOff className={iconClassName} aria-hidden />
      </div>
    );
  }
  return (
    <Image
      src={media.imageUrl}
      alt={title}
      fill
      sizes={SIZES}
      className={cn(
        'object-cover transition-all duration-300',
        status === 'DROPPED' && 'opacity-60 grayscale group-hover:opacity-90 group-hover:grayscale-0',
        className,
      )}
    />
  );
}

/** Classic: the card as it was before layouts (no activity badges). */
function PlainCard({ activity, onClick }: MediaCardProps) {
  const { media, status } = activity;
  const title = useDisplayTitle()(media);
  const Icon = STATUS_ICON[status];

  return (
    <button
      type="button"
      onClick={onClick}
      data-card="plain"
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-black/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        <Poster activity={activity} title={title} className="group-hover:scale-105" />
        <span
          className={cn('absolute left-1.5 top-1.5 rounded-full bg-black/65 p-1 backdrop-blur-sm', CHIP_TEXT[status])}
          title={STATUS_BASE_LABEL[status]}
        >
          <Icon className={cn('h-3.5 w-3.5', status === 'CONSUMING' && 'fill-current')} aria-hidden />
        </span>
        {activity.favorite && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-amber-300" title="Favorite">
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight" title={title}>
          {title}
        </h3>
        {media.year != null && <p className="text-xs text-muted-foreground">{media.year}</p>}
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <StatusBadge status={status} slug={activity.category} />
          {activity.rating != null && <RatingControl value={activity.rating} />}
        </div>
      </div>
    </button>
  );
}

/** Minimal: the poster and the title; nothing else competes. */
function PosterCard({ activity, onClick }: MediaCardProps) {
  const { media } = activity;
  const title = useDisplayTitle()(media);
  const meta = [media.year, mediaSubtitle(media, activity.category)].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      data-card="poster"
      className="group flex flex-col rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-black/5 transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-black/10 dark:ring-white/5 dark:group-hover:shadow-black/40">
        <Poster activity={activity} title={title} className="group-hover:scale-[1.03]" />
      </div>
      <div className="min-w-0 space-y-0.5 px-0.5 pb-1 pt-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug" title={title}>
          {title}
        </h3>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
    </button>
  );
}

/** Organised: compact and tidy, with at most one badge that matters now. */
function OneBadgeCard({ activity, onClick }: MediaCardProps) {
  const { media, status } = activity;
  const title = useDisplayTitle()(media);
  const { scorePlain } = useScoreFormat();
  const badge = useCardBadge(activity);

  return (
    <button
      type="button"
      onClick={onClick}
      data-card="one-badge"
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        <Poster activity={activity} title={title} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-tight" title={title}>
          {activity.favorite && (
            <Star className="mr-1 inline-block h-3 w-3 -translate-y-px fill-amber-400 text-amber-400" aria-label="Favorite" />
          )}
          {title}
        </h3>
        <p className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <StatusIcon status={status} className="h-3 w-3" />
          <span className="truncate">{[statusLabel(status, activity.category), media.year].filter(Boolean).join(' · ')}</span>
          {activity.rating != null && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 pl-1 font-medium tabular-nums text-amber-600 dark:text-amber-300">
              <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
              {scorePlain(activity.rating)}
            </span>
          )}
        </p>
        {badge && <CardBadgePill badge={badge} className="mt-auto" />}
      </div>
    </button>
  );
}

/** Fresh: poster-forward, the title on a gradient, a glass rating chip. */
function CinematicCard({ activity, onClick }: MediaCardProps) {
  const { media, status } = activity;
  const title = useDisplayTitle()(media);
  const { scorePlain } = useScoreFormat();
  const meta = [media.year, mediaSubtitle(media, activity.category)].filter(Boolean).join(' · ');
  // A thin progress line along the bottom while ongoing (a known total only).
  const progress =
    status === 'CONSUMING' && tracksProgress(activity.category)
      ? progressFraction(activity.progress, progressTotal(activity))
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      data-card="cinematic"
      className="group relative isolate block aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted text-left shadow-lg shadow-black/40 ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/60 hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <Poster activity={activity} title={title} className="group-hover:scale-105" iconClassName="mb-16 h-8 w-8" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/95 via-black/55 to-transparent"
      />
      <span className="absolute left-2 top-2 flex items-center gap-1">
        <span className="rounded-full bg-black/55 p-1 ring-1 ring-white/10" title={STATUS_BASE_LABEL[status]}>
          <StatusIcon status={status} className="h-3.5 w-3.5" />
        </span>
        {activity.favorite && (
          <span className="rounded-full bg-black/55 p-1 text-amber-300 ring-1 ring-white/10" title="Favorite">
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
          </span>
        )}
      </span>
      {activity.rating != null && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-200 shadow-sm backdrop-blur-md">
          <Star className="h-3 w-3 fill-current text-amber-300" aria-hidden />
          {scorePlain(activity.rating)}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 space-y-0.5 p-3">
        <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-tight text-white" title={title}>
          {title}
        </h3>
        {meta && <p className="truncate text-xs text-white/65">{meta}</p>}
      </div>
      {progress != null && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <span className="block h-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </span>
      )}
    </button>
  );
}
