'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The tonight picker (5.2). Everything is picked in the browser from the
//  queues the page sent (pure rules in src/lib/tonight.ts); only "on my
//  services" asks the server, lazily and ≤ 20 titles per call.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, Clock, ImageOff, Loader2, Shuffle } from 'lucide-react';

import { StreamingBadges } from '@/components/streaming-badges';
import { Button } from '@/components/ui/button';
import { loadStreamingBadges } from '@/lib/actions/streaming';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import type { TonightItem } from '@/lib/data-tonight';
import { WATCH_BATCH_LIMIT, isStreamable, type WatchOffer } from '@/lib/streaming';
import {
  TIME_CHOICES,
  formatMinutes,
  genreOptions,
  pickTonight,
  tonightPool,
  type TimeChoice,
} from '@/lib/tonight';
import { cn } from '@/lib/utils';

interface TonightClientProps {
  queues: Partial<Record<CategorySlug, TonightItem[]>>;
  /** Visible sections, in navigation order. */
  sections: CategorySlug[];
  hasServices: boolean;
}

/** At most this many lazy badge lookups per filter change or "Another" (60 titles each). */
const MAX_BATCHES = 3;

const chip = (on: boolean) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
    on ? 'border-primary/40 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:text-foreground',
  );

export function TonightClient({ queues, sections, hasServices }: TonightClientProps) {
  const withTitles = sections.filter((s) => (queues[s]?.length ?? 0) > 0);
  const [time, setTime] = useState<TimeChoice>('2h');
  const [chosen, setChosen] = useState<CategorySlug[]>(withTitles);
  const [genres, setGenres] = useState<string[]>([]);
  const [servicesOnly, setServicesOnly] = useState(false);
  const [round, setRound] = useState(0);
  const [badges, setBadges] = useState<Record<string, WatchOffer[]>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const batches = useRef(0);
  const timeLabel = useId();

  const chosenQueues = useMemo(() => chosen.flatMap((s) => queues[s] ?? []), [chosen, queues]);
  const allGenres = useMemo(() => genreOptions(chosenQueues), [chosenQueues]);
  const activeGenres = genres.filter((g) => allGenres.includes(g));
  const base = { time, sections: chosen, genres: activeGenres };

  // Every fitting title ignoring services: the order lookups follow.
  const pool = useMemo(() => tonightPool(queues, base), [queues, time, chosen, activeGenres.join('\u0000')]); // eslint-disable-line react-hooks/exhaustive-deps
  const poolKey = pool.map((p) => p.id).join(',');

  const onServices = servicesOnly ? (id: string) => (badges[id]?.length ?? 0) > 0 : null;
  const picks = pickTonight(queues, { ...base, onServices }, round);

  // Each filter change and each "Another" may look up MAX_BATCHES more, so
  // stepping through the picks keeps going deeper into long queues.
  useEffect(() => {
    batches.current = 0;
  }, [poolKey, servicesOnly, round]);

  // "On my services": look up the next unchecked streamable titles in pool order.
  useEffect(() => {
    if (!servicesOnly || !hasServices || loading || batches.current >= MAX_BATCHES) return;
    const matched = pool.filter((p) => (badges[p.id]?.length ?? 0) > 0).length;
    if (matched >= (round + 1) * 3) return;
    const next = pool
      .filter((p) => isStreamable(p.slug) && !checked.has(p.id))
      .slice(0, WATCH_BATCH_LIMIT)
      .map((p) => p.id);
    if (next.length === 0) return;
    batches.current += 1;
    setLoading(true);
    loadStreamingBadges(next)
      .then((res) => {
        if (res.ok) setBadges((b) => ({ ...b, ...(res.badges ?? {}) }));
      })
      .catch(() => undefined)
      .finally(() => {
        setChecked((c) => new Set([...c, ...next]));
        setLoading(false);
      });
  }, [servicesOnly, hasServices, loading, poolKey, round, badges, checked, pool]);

  // Badges for the picks on show (cheap: cached server-side, ≤ 3 titles).
  const pickKey = picks.map((p) => p.id).join(',');
  useEffect(() => {
    if (!hasServices) return;
    const ids = pickKey.split(',').filter((id) => id && !checked.has(id));
    const streamable = ids.filter((id) => {
      const p = picks.find((x) => x.id === id);
      return p && isStreamable(p.slug);
    });
    if (streamable.length === 0) return;
    let live = true;
    loadStreamingBadges(streamable)
      .then((res) => {
        if (live && res.ok) setBadges((b) => ({ ...b, ...(res.badges ?? {}) }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setChecked((c) => new Set([...c, ...streamable]));
      });
    return () => {
      live = false;
    };
  }, [pickKey, hasServices]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => setRound(0);
  const toggleSection = (s: CategorySlug) => {
    setChosen((c) => (c.includes(s) ? c.filter((x) => x !== s) : sections.filter((x) => x === s || c.includes(x))));
    reset();
  };
  const toggleGenre = (g: string) => {
    setGenres((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
    reset();
  };

  if (withTitles.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Your Up next queues are empty. Plan a few titles and they will show up here.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <p id={timeLabel} className="flex items-center gap-1.5 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            How much time?
          </p>
          <div role="radiogroup" aria-labelledby={timeLabel} className="flex flex-wrap gap-2">
            {TIME_CHOICES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={time === t.value}
                onClick={() => {
                  setTime(t.value);
                  reset();
                }}
                className={chip(time === t.value)}
              >
                {time === t.value && <Check className="h-3.5 w-3.5" aria-hidden />}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Sections</p>
          <div className="flex flex-wrap gap-2">
            {withTitles.map((s) => (
              <button key={s} type="button" aria-pressed={chosen.includes(s)} onClick={() => toggleSection(s)} className={chip(chosen.includes(s))}>
                {CATEGORIES[s].label}
              </button>
            ))}
          </div>
        </div>

        {allGenres.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              Genres <span className="font-normal text-muted-foreground">(any of them; none = all)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {allGenres.map((g) => (
                <button key={g} type="button" aria-pressed={activeGenres.includes(g)} onClick={() => toggleGenre(g)} className={chip(activeGenres.includes(g))}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className={cn('flex items-center gap-2 text-sm', !hasServices && 'text-muted-foreground')}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={servicesOnly && hasServices}
              disabled={!hasServices}
              onChange={(e) => {
                setServicesOnly(e.target.checked);
                reset();
              }}
            />
            On my services
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Checking services" />}
          </label>
          {!hasServices && (
            <p className="text-xs text-muted-foreground">
              Pick your services in{' '}
              <Link href="/settings#streaming" className="underline underline-offset-2">
                Settings
              </Link>{' '}
              to use this.
            </p>
          )}
        </div>
      </div>

      <section aria-labelledby="tonight-picks" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="tonight-picks" className="text-lg font-semibold">
            Tonight&apos;s picks
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setRound((r) => r + 1)} disabled={picks.length === 0}>
            <Shuffle className="mr-2 h-4 w-4" aria-hidden />
            Another
          </Button>
        </div>
        {picks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {servicesOnly && loading
              ? 'Checking your services…'
              : 'Nothing in your queues fits. Try more time, other sections or fewer genres.'}
          </p>
        ) : (
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {picks.map((p) => (
              <li key={p.id}>
                <PickCard item={p} offers={badges[p.id]} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function PickCard({ item, offers }: { item: TonightItem; offers?: WatchOffer[] }) {
  const length =
    item.slug === 'games'
      ? item.estimate.minutes
        ? `${formatMinutes(item.estimate.minutes)} to beat`
        : 'Several sessions'
      : item.slug === 'tv' || item.slug === 'anime'
        ? `${formatMinutes(item.estimate.minutes)} an episode`
        : formatMinutes(item.estimate.minutes) ?? (item.slug === 'manga' ? 'Several sessions' : 'Length unknown');
  return (
    <Link
      href={`/${item.slug}?open=${encodeURIComponent(item.id)}`}
      className="flex h-full gap-3 rounded-lg border border-border bg-card p-2.5 transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col"
    >
      <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border sm:w-full">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.title} fill sizes="(max-width: 640px) 80px, 220px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-6 w-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="line-clamp-2 font-semibold leading-tight">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {[CATEGORIES[item.slug].singular, item.year].filter(Boolean).join(' · ')}
        </p>
        <p className="text-xs font-medium">{length}</p>
        <StreamingBadges offers={offers} />
      </div>
    </Link>
  );
}
