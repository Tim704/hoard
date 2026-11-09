'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The tonight picker (5.2). Everything is picked in the browser from the
//  queues the page sent (pure rules in src/lib/tonight.ts).
// ───────────────────────────────────────────────────────────────────────────

import { useId, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, Clock, ImageOff, Shuffle } from 'lucide-react';

import { TitleLink } from '@/components/title/title-link';
import { Button } from '@/components/ui/button';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import type { TonightItem } from '@/lib/data-tonight';
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
}

/** A toggle chip: on = filled with a check, off = dashed (the look Notifications uses). */
const chip = (on: boolean) =>
  cn(
    'relative tap-area inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
    on
      ? 'border-primary/50 bg-accent font-medium text-accent-foreground'
      : 'border-dashed border-border text-muted-foreground hover:text-foreground',
  );

export function TonightClient({ queues, sections }: TonightClientProps) {
  const withTitles = sections.filter((s) => (queues[s]?.length ?? 0) > 0);
  const [time, setTime] = useState<TimeChoice>('2h');
  const [chosen, setChosen] = useState<CategorySlug[]>(withTitles);
  const [genres, setGenres] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const timeLabel = useId();

  const chosenQueues = useMemo(() => chosen.flatMap((s) => queues[s] ?? []), [chosen, queues]);
  const allGenres = useMemo(() => genreOptions(chosenQueues), [chosenQueues]);
  const activeGenres = genres.filter((g) => allGenres.includes(g));
  const base = { time, sections: chosen, genres: activeGenres };

  const picks = pickTonight(queues, base, round);
  // Another only means something when more titles fit than one round shows.
  const poolSize = tonightPool(queues, base).length;

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
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <p>Your Up next queues are empty. Plan a few titles and they will show up here.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/add">Add something to plan</Link>
        </Button>
      </div>
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
      </div>

      <section aria-labelledby="tonight-picks" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="tonight-picks" className="text-lg font-semibold">
            Tonight&apos;s picks
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setRound((r) => r + 1)} disabled={poolSize <= picks.length}>
            <Shuffle className="mr-2 h-4 w-4" aria-hidden />
            Another
          </Button>
        </div>
        {picks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing in your queues fits. Try more time, other sections or fewer genres.
          </p>
        ) : (
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {picks.map((p) => (
              <li key={p.id}>
                <PickCard item={p} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* The answer comes first; narrowing by section or genre is one tap away. */}
      <details className="group rounded-xl border border-border bg-card p-4">
        <summary className="relative tap-area cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
          More filters{' '}
          <span className="font-normal text-muted-foreground">
            {chosen.length < withTitles.length || activeGenres.length > 0 ? '(some sections or genres only)' : '(sections and genres)'}
          </span>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
          <p className="text-sm font-medium">Sections</p>
          <div className="flex flex-wrap gap-2">
            {withTitles.map((s) => (
              <button key={s} type="button" aria-pressed={chosen.includes(s)} onClick={() => toggleSection(s)} className={chip(chosen.includes(s))}>
                {chosen.includes(s) && <Check className="h-3.5 w-3.5" aria-hidden />}
                {CATEGORIES[s].label}
              </button>
            ))}
          </div>
          </div>

        {allGenres.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              Genres <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {allGenres.map((g) => (
                <button key={g} type="button" aria-pressed={activeGenres.includes(g)} onClick={() => toggleGenre(g)} className={chip(activeGenres.includes(g))}>
                  {activeGenres.includes(g) && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
        </div>
      </details>
    </div>
  );
}

function PickCard({ item }: { item: TonightItem }) {
  const length =
    item.slug === 'games'
      ? item.estimate.minutes
        ? `${formatMinutes(item.estimate.minutes)} to beat`
        : 'Several sessions'
      : item.slug === 'tv' || item.slug === 'anime'
        ? `${formatMinutes(item.estimate.minutes)} an episode`
        : formatMinutes(item.estimate.minutes) ?? (item.slug === 'manga' ? 'Several sessions' : 'Length unknown');
  return (
    <TitleLink
      slug={item.slug}
      id={item.id}
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
      </div>
    </TitleLink>
  );
}
