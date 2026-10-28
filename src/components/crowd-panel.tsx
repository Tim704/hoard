'use client';

import { useMemo } from 'react';
import { ChevronDown, Users } from 'lucide-react';

import { useDisplayTitle, useScoreFormat } from '@/components/prefs-provider';
import { usePersistentState } from '@/hooks/use-persistent-state';
import type { CategorySlug } from '@/lib/categories';
import { biggestDisagreements, crowdSummary } from '@/lib/crowd';
import { formatScoreDiff } from '@/lib/rating';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** Colour for a difference: green when you liked it more, red when less. */
const diffClass = (diff: number) =>
  diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : diff < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground';

/**
 * "You vs. the crowd" (spec 1.9): a collapsible panel on the section page
 * with the ten titles where your score and the provider's community score
 * differ most, and your average difference. Hidden when nothing compares
 * (books and music have no crowd score).
 */
export function CrowdPanel({
  slug,
  activities,
  source,
}: {
  slug: CategorySlug;
  activities: ActivityWithMedia[];
  /** Provider name for the crowd ("TMDB", …). */
  source: string;
}) {
  const [open, setOpen] = usePersistentState<boolean>(`hoard:${slug}:crowd`, false, isBool);
  const { score, format } = useScoreFormat();
  const titleOf = useDisplayTitle();
  const top = useMemo(() => biggestDisagreements(activities, 10), [activities]);
  const summary = useMemo(() => crowdSummary(activities), [activities]);

  if (summary.count === 0 || summary.meanDiff == null || summary.meanGap == null) return null;

  const crowdName = slug === 'anime' || slug === 'manga' ? 'MyAnimeList' : source;
  const lean =
    Math.round(summary.meanDiff * 10) === 0
      ? 'On average you score the same as the crowd'
      : `On average you score ${formatScoreDiff(Math.abs(summary.meanDiff), format).slice(1)} ${
          summary.meanDiff > 0 ? 'higher' : 'lower'
        } than the crowd`;
  const bodyId = `crowd-${slug}`;

  return (
    <section className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
          aria-hidden
        />
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-semibold">You vs. the crowd</span>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {summary.count} compared · typical gap {formatScoreDiff(summary.meanGap, format).slice(1)}
        </span>
      </button>

      {open && (
        <div id={bodyId} className="space-y-3 border-t border-border px-3 py-3">
          <p className="text-sm text-muted-foreground">
            {lean}, across {summary.count} {summary.count === 1 ? 'title' : 'titles'} with a{' '}
            {crowdName} score. Your biggest disagreements:
          </p>
          <ol className="space-y-1.5">
            {top.map(({ activity, yours, crowd, diff }) => (
              <li key={activity.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate" title={titleOf(activity.media)}>
                  {titleOf(activity.media)}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="sr-only">You </span>
                  <span className="font-medium text-foreground">{score(yours)}</span>
                  <span aria-hidden> vs </span>
                  <span className="sr-only"> versus the crowd </span>
                  {score(crowd)}
                </span>
                <span className={cn('w-12 shrink-0 text-right font-semibold tabular-nums', diffClass(diff))}>
                  {formatScoreDiff(diff, format)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
