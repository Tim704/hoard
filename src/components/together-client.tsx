'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import { ImageOff, Loader2 } from 'lucide-react';

import { StreamingBadges, useStreamingBadges } from '@/components/streaming-badges';
import { Button } from '@/components/ui/button';
import { compareWith } from '@/lib/actions/together';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import type { TogetherItem } from '@/lib/data-together';
import { isStreamable } from '@/lib/streaming';
import { cn } from '@/lib/utils';

const DEFAULT_SECTIONS: CategorySlug[] = ['movies', 'tv', 'anime'];

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 sm:w-64';

export function TogetherClient({ users, sections }: { users: string[]; sections: CategorySlug[] }) {
  const [other, setOther] = useState(users[0] ?? '');
  const defaults = sections.filter((s) => DEFAULT_SECTIONS.includes(s));
  const [chosen, setChosen] = useState<CategorySlug[]>(defaults.length ? defaults : sections);
  const [result, setResult] = useState<{ with: string; items: TogetherItem[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  const badges = useStreamingBadges(
    (result?.items ?? []).filter((i) => isStreamable(i.slug)).map((i) => i.activityId),
  );

  function compare() {
    if (!other) return;
    startTransition(async () => {
      const res = await compareWith(other, chosen);
      if (res.ok) setResult({ with: other, items: res.items ?? [] });
      else {
        setResult(null);
        toast.error(res.error ?? 'Could not compare.');
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <label htmlFor="together-user" className="text-sm font-medium">
            With
          </label>
          <select id="together-user" className={selectClass} value={other} onChange={(e) => setOther(e.target.value)}>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Sections</p>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => {
              const on = chosen.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChosen((c) => (on ? c.filter((x) => x !== s) : [...c, s]))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'border-primary/40 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {CATEGORIES[s].label}
                </button>
              );
            })}
          </div>
        </div>
        <Button type="button" onClick={compare} disabled={isPending || !other || chosen.length === 0}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Find what we both want
        </Button>
      </div>

      {result && (
        <section aria-labelledby="together-results" className="space-y-3">
          <h2 id="together-results" className="text-lg font-semibold">
            You and {result.with}
          </h2>
          {result.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nothing in common in these sections yet.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {result.items.map((item, i) => (
                <li key={`${item.slug}:${item.activityId}`}>
                  <Link
                    href={`/${item.slug}?open=${encodeURIComponent(item.activityId)}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 pr-3 transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="w-6 shrink-0 text-center font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.title} fill sizes="44px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[CATEGORIES[item.slug].singular, item.year].filter(Boolean).join(' · ')} · #{item.myPosition} in
                        your queue, #{item.theirPosition} in theirs
                      </p>
                      <StreamingBadges offers={badges?.[item.activityId]} className="mt-1" />
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
