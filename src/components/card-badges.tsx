'use client';

import { CalendarClock, Clock, Headphones, Sparkles, TrendingUp } from 'lucide-react';

import { useToday } from '@/components/prefs-provider';
import { pickCardBadge, type CardBadge, type CardBadgeKind } from '@/lib/card-badge';
import { countdownLabel } from '@/lib/release';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

/** "in 12 days" for a Planned title with a future release day (5.9), else null. */
export function useCountdown(activity: ActivityWithMedia): string | null {
  const today = useToday();
  if (!today || activity.status !== 'PLANNED') return null;
  return countdownLabel(activity.media, today);
}

/** The countdown chip (Up next's rows). */
export function CountdownBadge({ activity, className }: { activity: ActivityWithMedia; className?: string }) {
  const label = useCountdown(activity);
  if (!label) return null;
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300',
        className,
      )}
      title="Release countdown"
    >
      <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

const PILL: Record<CardBadgeKind, { Icon: typeof Sparkles; tone: string }> = {
  'new-season': { Icon: Sparkles, tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  countdown: { Icon: CalendarClock, tone: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  listen: { Icon: Headphones, tone: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  progress: { Icon: TrendingUp, tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  'time-to-beat': { Icon: Clock, tone: 'border-border bg-muted/60 text-muted-foreground' },
};

/** The one badge that matters for a title now (Organised's cards and rows), or null. */
export function useCardBadge(activity: ActivityWithMedia): CardBadge | null {
  return pickCardBadge(activity, useToday());
}

/** A small pill for a picked badge (src/lib/card-badge.ts). */
export function CardBadgePill({ badge, className }: { badge: CardBadge; className?: string }) {
  const { Icon, tone } = PILL[badge.kind];
  return (
    <span
      data-card-badge={badge.kind}
      title={badge.title}
      className={cn(
        'inline-flex w-fit max-w-full items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px] font-medium leading-4',
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{badge.label}</span>
    </span>
  );
}
