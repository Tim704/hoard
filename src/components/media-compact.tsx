'use client';

import { ChevronRight, Layers } from 'lucide-react';

import { CardAction } from '@/components/card-action';
import { FranchiseGroupHeader, GroupRating, StackStatus } from '@/components/franchise-group';
import { CardBadgePill, useCardBadge } from '@/components/card-badges';
import { StatusIcon } from '@/components/status-icon';
import type { CategorySlug } from '@/lib/categories';
import type { CardStyle } from '@/lib/layouts';
import { mediaSubtitle } from '@/lib/media-meta';
import { statusLabel } from '@/lib/status';
import { useDisplayTitle, useLayout, useScoreFormat } from '@/components/prefs-provider';
import type { ActivityWithMedia, DisplayUnit } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MediaCompactProps {
  units: DisplayUnit[];
  slug: CategorySlug;
  onSelect: (a: ActivityWithMedia) => void;
  /** A title's page (Full page title view): its row links there instead of calling onSelect. */
  hrefFor?: (a: ActivityWithMedia) => string | undefined;
  expanded: Set<string>;
  onToggleGroup: (franchiseId: string) => void;
  /** Under a status heading (rows that show no status needn't name it). */
  inStatusSection?: boolean;
}

const COLS = 'grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2 xl:grid-cols-3';

/**
 * A space-efficient, imageless overview: a multi-column list where each row is
 * a clickable button showing a status icon, the title, year + status label, and
 * the rating. Franchises collapse into one row that expands to a full-width block.
 * Rows show as much as the layout's cards (`useLayout().card`): Minimal only
 * the title and year, Organised adds one badge, Fresh darkens the rows.
 */
export function MediaCompact({ units, slug, onSelect, hrefFor, expanded, onToggleGroup, inStatusSection }: MediaCompactProps) {
  const style = useLayout().card;
  if (units.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  }

  return (
    <ul className={COLS}>
      {units.map((unit) => {
        if (unit.kind === 'item') {
          return (
            <li key={unit.activity.id}>
              <CompactRow activity={unit.activity} slug={slug} onSelect={onSelect} href={hrefFor?.(unit.activity)} style={style} inStatusSection={inStatusSection} />
            </li>
          );
        }
        const { franchise, members } = unit;
        if (expanded.has(franchise.id)) {
          return (
            <li
              key={franchise.id}
              className="col-span-full my-2 space-y-1 rounded-xl border border-dashed border-border bg-muted/20 p-3"
            >
              <FranchiseGroupHeader
                franchise={franchise}
                members={members}
                onToggle={() => onToggleGroup(franchise.id)}
              />
              <ul className={cn(COLS, 'pt-1')}>
                {members.map((a) => (
                  <li key={a.id}>
                    <CompactRow activity={a} slug={slug} onSelect={onSelect} href={hrefFor?.(a)} style={style} inStatusSection={inStatusSection} />
                  </li>
                ))}
              </ul>
            </li>
          );
        }
        return (
          <li key={franchise.id}>
            <button
              type="button"
              onClick={() => onToggleGroup(franchise.id)}
              aria-expanded={false}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border border-dashed border-border px-2.5 py-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-2.5',
                style === 'cinematic' && 'rounded-lg border-white/10 bg-white/[0.03] hover:bg-white/[0.07]',
              )}
            >
              <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{franchise.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {members.length} titles
                  <StackStatus members={members} inStatusSection={inStatusSection} />
                </span>
              </span>
              <GroupRating franchise={franchise} members={members} className="shrink-0" />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CompactRow({
  activity,
  slug,
  onSelect,
  href,
  style,
  inStatusSection,
}: {
  activity: ActivityWithMedia;
  slug: CategorySlug;
  onSelect: (a: ActivityWithMedia) => void;
  href?: string;
  style: CardStyle;
  inStatusSection?: boolean;
}) {
  const { media, status, rating } = activity;
  const title = useDisplayTitle()(media);
  const { scoreOutOf } = useScoreFormat();
  const badge = useCardBadge(activity);
  const minimal = style === 'poster';
  const meta = minimal
    ? [media.year, mediaSubtitle(media, activity.category)]
    : [media.year, statusLabel(status, slug)];
  return (
    <CardAction
      href={href}
      onClick={() => onSelect(activity)}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border border-transparent px-2.5 py-3 text-left transition-colors hover:border-border hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-2.5',
        status === 'DROPPED' && 'opacity-70',
        style === 'cinematic' && 'rounded-lg bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.07]',
      )}
    >
      {/* The meta line says the status, so the icon is decorative. */}
      {!minimal && <StatusIcon status={status} decorative />}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium', style === 'cinematic' && 'font-semibold')} title={title}>
          {title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{meta.filter(Boolean).join(' · ')}</span>
          {minimal && !inStatusSection && <span className="sr-only">, {statusLabel(status, slug)}</span>}
          {style === 'one-badge' && badge && <CardBadgePill badge={badge} className="max-w-[60%] shrink-0 py-0" />}
        </span>
      </span>
      {!minimal && (
        <span
          className={cn(
            'w-12 shrink-0 text-right text-sm tabular-nums',
            rating != null ? 'font-medium text-rating' : 'text-muted-foreground',
          )}
        >
          {scoreOutOf(rating)}
        </span>
      )}
    </CardAction>
  );
}
