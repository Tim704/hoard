'use client';

import { CalendarClock } from 'lucide-react';

import { useToday } from '@/components/prefs-provider';
import { formatTimeToBeat } from '@/lib/media-meta';
import { countdownLabel } from '@/lib/release';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

/** "in 12 days" for a Planned title with a future release day (5.9), else null. */
export function useCountdown(activity: ActivityWithMedia): string | null {
  const today = useToday();
  if (!today || activity.status !== 'PLANNED') return null;
  return countdownLabel(activity.media, today);
}

/** "≈ 32 h" for a game with a time to beat (5.3), else null. */
export function cardTimeToBeat(activity: ActivityWithMedia): string | null {
  if (activity.category !== 'games') return null;
  const h = activity.media.timeToBeatHours;
  return formatTimeToBeat(typeof h === 'number' ? h : null);
}

/** The countdown chip shown on cards and rows. */
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
