'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { MonitorPlay } from 'lucide-react';

import { loadStreamingBadges } from '@/lib/actions/streaming';
import { WATCH_BATCH_LIMIT, type WatchOffer } from '@/lib/streaming';
import { cn } from '@/lib/utils';

/**
 * Lazily loads "on your services" badges (5.1) for the given activity ids:
 * one server action call for the first WATCH_BATCH_LIMIT of them, cached on
 * the server for 7 days. Returns null until the answer arrives.
 */
export function useStreamingBadges(ids: string[]): Record<string, WatchOffer[]> | null {
  // Sorted, so reordering the same rows (a drag) doesn't refetch.
  const key = ids.slice(0, WATCH_BATCH_LIMIT).sort().join(',');
  const [state, setState] = useState<{ key: string; badges: Record<string, WatchOffer[]> } | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    loadStreamingBadges(key.split(','))
      .then((res) => {
        if (live) setState({ key, badges: res.ok ? (res.badges ?? {}) : {} });
      })
      .catch(() => {
        if (live) setState({ key, badges: {} });
      });
    return () => {
      live = false;
    };
  }, [key]);

  return useMemo(() => (state && state.key === key ? state.badges : key ? null : {}), [state, key]);
}

/** Small "on your services" chips: a logo when there is one, else the name. */
export function StreamingBadges({ offers, className }: { offers: WatchOffer[] | undefined; className?: string }) {
  if (!offers || offers.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <MonitorPlay className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="On your services" />
      {offers.slice(0, 4).map((o) => (
        <span
          key={`${o.id ?? ''}:${o.name}`}
          title={`On ${o.name}`}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
        >
          {o.logo ? (
            <Image src={o.logo} alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-sm object-cover" />
          ) : null}
          <span className="max-w-[8rem] truncate">{o.name}</span>
        </span>
      ))}
    </span>
  );
}
