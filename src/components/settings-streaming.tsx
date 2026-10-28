'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Streaming (5.1): pick your services from the region's TMDB
//  list (cached 7 days; a short static list without a key). And Settings →
//  Compare (5.8): the opt-in that lets other users of this Hoard run
//  "Watch together" with you. Both save on change through `updatePrefs`.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, Loader2, Users } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { updatePrefs } from '@/lib/actions/prefs';
import { loadProviderOptions } from '@/lib/actions/streaming';
import type { ProviderOption } from '@/lib/streaming';
import { cn } from '@/lib/utils';

/** How many unselected services are shown before you search. */
const SHOWN = 24;

export function SettingsStreaming({ initial, region }: { initial: number[]; region: string | null }) {
  const [services, setServices] = useState<number[]>(initial);
  const [options, setOptions] = useState<ProviderOption[] | null>(null);
  const [source, setSource] = useState<'tmdb' | 'fallback'>('fallback');
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    setOptions(null);
    loadProviderOptions()
      .then((res) => {
        if (!live) return;
        setOptions(res.ok ? (res.options ?? []) : []);
        setSource(res.source ?? 'fallback');
      })
      .catch(() => live && setOptions([]));
    return () => {
      live = false;
    };
  }, [region]);

  function toggle(id: number) {
    const before = services;
    const next = services.includes(id) ? services.filter((x) => x !== id) : [...services, id];
    setServices(next);
    startTransition(async () => {
      const res = await updatePrefs({ streamingServices: next });
      if (res.ok) toast.success('Saved.');
      else {
        setServices(before);
        toast.error(res.error ?? 'Could not save your services.');
      }
    });
  }

  const shown = useMemo(() => {
    if (!options) return [];
    const q = query.trim().toLowerCase();
    const selected = options.filter((o) => services.includes(o.id));
    const rest = options.filter((o) => !services.includes(o.id) && (!q || o.name.toLowerCase().includes(q)));
    return [...selected, ...(q ? rest : rest.slice(0, SHOWN))];
  }, [options, services, query]);

  return (
    <Card id="streaming">
      <CardHeader>
        <CardTitle className="text-base">Streaming</CardTitle>
        <CardDescription>
          Your services come first in &ldquo;Where to watch&rdquo; and get a badge in Up next, the tonight picker and
          Watch together.{' '}
          {region ? `Showing services for ${region}.` : 'Choose a region above to see the services offered there.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {options === null ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading services…
          </p>
        ) : (
          <>
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a service…"
              aria-label="Find a service"
              className="text-base sm:text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {shown.map((o) => {
                const on = services.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={on}
                    disabled={isPending}
                    onClick={() => toggle(o.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                      on
                        ? 'border-primary/40 bg-accent text-accent-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {on ? (
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    ) : o.logo ? (
                      <Image src={o.logo} alt="" width={16} height={16} className="h-4 w-4 rounded-sm object-cover" />
                    ) : null}
                    {o.name}
                  </button>
                );
              })}
              {shown.length === 0 && <p className="text-sm text-muted-foreground">No service matches.</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              {source === 'tmdb'
                ? 'Service list and streaming data by JustWatch, via TMDB.'
                : 'TMDB isn’t reachable or configured, so this is a short list of common services.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsCompare({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = await updatePrefs({ compareOptIn: next });
      if (res.ok) toast.success(next ? 'Others can now compare with you.' : 'Comparing turned off.');
      else {
        setOn(!next);
        toast.error(res.error ?? 'Could not save that setting.');
      }
    });
  }

  return (
    <Card id="compare">
      <CardHeader>
        <CardTitle className="text-base">Compare with other users</CardTitle>
        <CardDescription>
          Off by default. When on, other users of this Hoard who also turned it on can pick you in{' '}
          <Link href="/together" className="underline underline-offset-2">
            Watch together
          </Link>
          . They see only your username and the planned titles you both have queued, with their places in each
          queue. Never your other titles, scores or notes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={on}
            disabled={isPending}
            onChange={toggle}
          />
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          Let other users of this Hoard compare with me
        </label>
      </CardContent>
    </Card>
  );
}
