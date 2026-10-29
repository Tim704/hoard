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
    <span className={cn('inline-flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-300', className)}>
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

/** Grid view: a poster with stacked layers behind it, standing in for a franchise. */
export function FranchiseStackCard({ franchise, members, expanded, onToggle, inStatusSection }: FranchiseStackCardProps) {
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
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
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
