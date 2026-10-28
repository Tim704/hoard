'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Streaming (5.1): pick your services from the region's TMDB
//  list (cached 7 days; a short static list without a key). And the two
//  sharing opt-ins: Compare (5.8 / 9.1), which lets other opted-in users run
//  Compare and Watch together with you, and the activity Feed (9.2). All
//  save on change through `updatePrefs`.
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
import { KNOWN_PROVIDER_NAMES, type ProviderOption } from '@/lib/streaming';
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
    // Picks the region doesn't list (another region's id, an old fallback
    // pick) stay visible so they can be turned off.
    const known = new Map(KNOWN_PROVIDER_NAMES);
    const offered = new Set(options.map((o) => o.id));
    const missing = services
      .filter((id) => !offered.has(id))
      .map((id) => ({
        id,
        name: `${known.get(id) ?? `Service #${id}`}${region ? ` (not offered in ${region})` : ''}`,
        logo: null,
      }));
    const selected = [...options.filter((o) => services.includes(o.id)), ...missing];
    const rest = options.filter((o) => !services.includes(o.id) && (!q || o.name.toLowerCase().includes(q)));
    return [...selected, ...(q ? rest : rest.slice(0, SHOWN))];
  }, [options, services, query, region]);

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

/** One "share with other users" switch (G2: off by default), saved on change. */
function OptInCard({
  id,
  title,
  description,
  label,
  field,
  initial,
  onMessage,
  offMessage,
}: {
  id: string;
  title: string;
  description: React.ReactNode;
  label: string;
  field: 'compareOptIn' | 'feedOptIn';
  initial: boolean;
  onMessage: string;
  offMessage: string;
}) {
  const [on, setOn] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = await updatePrefs(field === 'compareOptIn' ? { compareOptIn: next } : { feedOptIn: next });
      if (res.ok) toast.success(next ? onMessage : offMessage);
      else {
        setOn(!next);
        toast.error(res.error ?? 'Could not save that setting.');
      }
    });
  }

  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
          {label}
        </label>
      </CardContent>
    </Card>
  );
}

export function SettingsCompare({ initial }: { initial: boolean }) {
  return (
    <OptInCard
      id="compare"
      field="compareOptIn"
      initial={initial}
      title="Compare with other users"
      label="Let other users of this Hoard compare with me"
      onMessage="Others can now compare with you."
      offMessage="Comparing turned off."
      description={
        <>
          Off by default. When on, other users of this Hoard who also turned it on see your username and can open{' '}
          <Link href="/compare" className="underline underline-offset-2">
            Compare
          </Link>{' '}
          and{' '}
          <Link href="/together" className="underline underline-offset-2">
            Watch together
          </Link>{' '}
          with you. Compare shows the titles you both have with both scores, a compatibility score, and the titles in
          your S tier they don’t have. Watch together shows the planned titles you both have queued, with their places in
          each queue. Never your notes, reviews, dates or other statuses.
        </>
      }
    />
  );
}

export function SettingsFeed({ initial }: { initial: boolean }) {
  return (
    <OptInCard
      id="feed"
      field="feedOptIn"
      initial={initial}
      title="Activity feed"
      label="Show my activity in the feed"
      onMessage="Your activity now shows in the feed."
      offMessage="Your activity is out of the feed."
      description={
        <>
          Off by default. When on, everyone on this Hoard sees in the{' '}
          <Link href="/feed" className="underline underline-offset-2">
            Feed
          </Link>{' '}
          what you finished (with that run’s score), dropped (with the title’s current score) or put in S tier over
          the last 30 days, under your username. Turning it off takes all of it out of everyone’s feed at once.
        </>
      }
    />
  );
}
