'use client';

import Image from 'next/image';
import { ChevronDown, ImageOff, Layers, Star } from 'lucide-react';

import { useLayout, useScoreFormat } from '@/components/prefs-provider';
import { statusSummary } from '@/lib/status';
import type { ActivityWithMedia, FranchiseRef } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Average of the members' own ratings (rated members only), 1 decimal. */
export function memberAverage(members: ActivityWithMedia[]): number | null {
  const rated = members.filter((m) => m.rating != null);
  if (rated.length === 0) return null;
  return Math.round((rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length) * 10) / 10;
}

/** The cover for a group: the franchise's chosen cover, else the first member's. */
export function groupCover(franchise: FranchiseRef, members: ActivityWithMedia[]): string | null {
  return franchise.imageUrl ?? members.find((m) => m.media.imageUrl)?.media.imageUrl ?? null;
}

/**
 * The rating line for a group: the user's IP rating when set, else the members'
 * average (labelled "avg" so the two are never confused).
 */
export function GroupRating({
  franchise,
  members,
  className,
}: {
  franchise: FranchiseRef;
  members: ActivityWithMedia[];
  className?: string;
}) {
  const { scorePlain, scoreOutOfPlain } = useScoreFormat();
  const avg = memberAverage(members);
  if (franchise.rating == null && avg == null) {
    return <span className={cn('text-sm text-muted-foreground', className)}>—</span>;
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-medium text-rating', className)}>
      <Star className={cn('h-3.5 w-3.5', franchise.rating != null && 'fill-current')} aria-hidden />
      {franchise.rating != null ? scoreOutOfPlain(franchise.rating) : `${scorePlain(avg)} avg`}
    </span>
  );
}

/**
 * Minimal's cards show no status, so a collapsed franchise names its
 * members' statuses to screen readers (", 2 read, 1 unread") when they
 * differ, or when no status heading above it says theirs. Nothing in the
 * other layouts.
 */
export function StackStatus({ members, inStatusSection }: { members: ActivityWithMedia[]; inStatusSection?: boolean }) {
  const minimal = useLayout().card === 'poster';
  const statuses = members.map((m) => m.status);
  const mixed = new Set(statuses).size > 1;
  if (!minimal || members.length === 0 || (inStatusSection && !mixed)) return null;
  return <span className="sr-only">, {statusSummary(statuses, members[0].category)}</span>;
}

interface FranchiseStackCardProps {
  franchise: FranchiseRef;
  members: ActivityWithMedia[];
  expanded: boolean;
  onToggle: () => void;
  /** Under a status heading (see StackStatus). */
  inStatusSection?: boolean;
}

/**
 * Grid view: a poster with stacked layers behind it, standing in for a
 * franchise. Like a title's card (media-card.tsx) it follows the layout's
 * card style (`useLayout().card`), so a stack sits among the cards as one
 * of them:
 * - plain (Classic): the stack as it was before layouts;
 * - poster (Minimal): borderless posters, the name and a quiet count;
 * - one-badge (Organised): a stack of bordered cards with a tidy meta line;
 * - cinematic (Fresh): the cover fills the card, the name on a gradient.
 */
export function FranchiseStackCard(props: FranchiseStackCardProps) {
  switch (useLayout().card) {
    case 'poster':
      return <PosterStack {...props} />;
    case 'one-badge':
      return <OneBadgeStack {...props} />;
    case 'cinematic':
      return <CinematicStack {...props} />;
    default:
      return <PlainStack {...props} />;
  }
}

const COVER_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw';

/** Classic: the stack card as it was before layouts. */
function PlainStack({ franchise, members, expanded, onToggle, inStatusSection }: FranchiseStackCardProps) {
  const cover = groupCover(franchise, members);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="group flex flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative w-full pr-2 pt-2">
        {/* Two offset layers suggest a stack of titles. */}
        <span className="absolute inset-x-2 bottom-2 top-0 translate-x-2 rounded-lg border border-border bg-muted/60" aria-hidden />
        <span className="absolute inset-x-1 bottom-1 top-1 translate-x-1 rounded-lg border border-border bg-muted" aria-hidden />
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-border bg-muted transition-transform group-hover:-translate-y-0.5">
          {cover ? (
            <Image
              src={cover}
              alt={franchise.name}
              fill
              sizes={COVER_SIZES}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageOff className="h-8 w-8" aria-hidden />
            </div>
          )}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
            <Layers className="h-3 w-3" aria-hidden />
            {members.length}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1 px-0.5 pt-2.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{franchise.name}</h3>
        <p className="text-xs text-muted-foreground">
          {members.length} titles
          <StackStatus members={members} inStatusSection={inStatusSection} /> · tap to {expanded ? 'collapse' : 'expand'}
        </p>
        <GroupRating franchise={franchise} members={members} />
      </div>
    </button>
  );
}

/**
 * The cover filling its box (decorative: the name is in the card's text),
 * or a placeholder.
 */
function StackCover({
  cover,
  className,
  iconClassName = 'h-8 w-8',
}: {
  cover: string | null;
  className?: string;
  iconClassName?: string;
}) {
  if (!cover) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <ImageOff className={iconClassName} aria-hidden />
      </div>
    );
  }
  return <Image src={cover} alt="" fill sizes={COVER_SIZES} className={cn('object-cover transition-transform duration-300', className)} />;
}

/**
 * The franchise's own rating, else the members' average ("avg"), as a
 * compact star and number; nothing when neither exists.
 */
function StackScore({
  franchise,
  members,
  className,
  starClassName = 'h-2.5 w-2.5',
}: {
  franchise: FranchiseRef;
  members: ActivityWithMedia[];
  className?: string;
  starClassName?: string;
}) {
  const { scorePlain } = useScoreFormat();
  const avg = memberAverage(members);
  if (franchise.rating == null && avg == null) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5 font-medium tabular-nums', className)}>
      <Star className={cn(starClassName, franchise.rating != null && 'fill-current')} aria-hidden />
      <span className="sr-only">, rated </span>
      {franchise.rating != null ? scorePlain(franchise.rating) : `${scorePlain(avg)} avg`}
    </span>
  );
}

/** Minimal: borderless posters stacked, the name and a quiet count below. */
function PosterStack({ franchise, members, expanded, onToggle, inStatusSection }: FranchiseStackCardProps) {
  const cover = groupCover(franchise, members);
  const layer = 'absolute rounded-lg ring-1 ring-inset ring-black/5 dark:ring-white/5';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      data-card="poster-stack"
      className="group flex flex-col rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <div className="relative w-full pr-2 pt-2">
        <span aria-hidden className={cn(layer, 'inset-x-2 bottom-2 top-0 translate-x-2 bg-muted/60')} />
        <span aria-hidden className={cn(layer, 'inset-x-1 bottom-1 top-1 translate-x-1 bg-muted')} />
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-black/5 transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-black/10 dark:ring-white/5 dark:group-hover:shadow-black/40">
          <StackCover cover={cover} className="group-hover:scale-[1.03]" />
        </div>
      </div>
      <div className="min-w-0 space-y-0.5 px-0.5 pb-1 pt-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{franchise.name}</h3>
        <p className="truncate text-xs text-muted-foreground">
          {members.length} titles
          <StackStatus members={members} inStatusSection={inStatusSection} /> · tap to {expanded ? 'collapse' : 'expand'}
        </p>
      </div>
    </button>
  );
}

/** Organised: a stack of bordered cards; the count and score on one tidy line. */
function OneBadgeStack({ franchise, members, expanded, onToggle, inStatusSection }: FranchiseStackCardProps) {
  const cover = groupCover(franchise, members);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      data-card="one-badge-stack"
      className="group relative flex flex-col rounded-lg pr-1.5 pt-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* The cards behind: a stack of titles. */}
      <span aria-hidden className="absolute bottom-1.5 left-1.5 right-0 top-0 rounded-lg border border-border bg-muted" />
      <span className="relative flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors group-hover:border-primary/50">
        <span className="relative block aspect-[2/3] w-full overflow-hidden bg-muted">
          <StackCover cover={cover} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 p-2">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-tight">{franchise.name}</h3>
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Layers className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">
              {members.length} titles
              <StackStatus members={members} inStatusSection={inStatusSection} />
            </span>
            <StackScore franchise={franchise} members={members} className="ml-auto pl-1 text-rating" />
          </span>
          <span className="sr-only">, tap to {expanded ? 'collapse' : 'expand'}</span>
        </span>
      </span>
    </button>
  );
}

/** Fresh: the cover fills the card, the name on a gradient, dark chips. */
function CinematicStack({ franchise, members, expanded, onToggle, inStatusSection }: FranchiseStackCardProps) {
  const cover = groupCover(franchise, members);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      data-card="cinematic-stack"
      className="group relative block w-full rounded-xl pr-2 pt-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Two offset glass layers suggest a stack of titles. */}
      <span aria-hidden className="absolute inset-x-2 bottom-2 top-0 translate-x-2 rounded-xl bg-white/[0.04] ring-1 ring-white/10" />
      <span aria-hidden className="absolute inset-x-1 bottom-1 top-1 translate-x-1 rounded-xl bg-white/[0.08] ring-1 ring-white/10" />
      <span className="relative isolate block aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted shadow-lg shadow-black/40 ring-1 ring-white/10 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl group-hover:shadow-black/60 group-hover:ring-primary/40 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <StackCover cover={cover} className="group-hover:scale-105" iconClassName="mb-16 h-8 w-8" />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/95 via-black/55 to-transparent"
        />
        <span className="absolute inset-x-0 bottom-0 space-y-0.5 p-3">
          <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-tight text-white">{franchise.name}</h3>
          <span className="block truncate text-xs text-white/65">
            {members.length} titles
            <StackStatus members={members} inStatusSection={inStatusSection} /> · tap to {expanded ? 'collapse' : 'expand'}
          </span>
        </span>
        <span
          aria-hidden
          className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-white/10"
        >
          <Layers className="h-3 w-3" />
          {members.length}
        </span>
        <StackScore
          franchise={franchise}
          members={members}
          // Opaque, not blurred glass: legible on light covers too.
          className="absolute right-2 top-2 gap-1 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-amber-300 shadow-sm ring-1 ring-white/10"
          starClassName="h-3 w-3"
        />
      </span>
    </button>
  );
}

/** Header bar shown above an expanded franchise's titles (all views). */
export function FranchiseGroupHeader({
  franchise,
  members,
  onToggle,
}: {
  franchise: FranchiseRef;
  members: ActivityWithMedia[];
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded
      className="flex w-full items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate font-semibold">{franchise.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{members.length} titles</span>
      <GroupRating franchise={franchise} members={members} className="ml-auto shrink-0" />
    </button>
  );
}
