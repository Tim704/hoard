'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, Loader2, MonitorPlay } from 'lucide-react';

import { loadWhereToWatch, type WhereToWatch as Result } from '@/lib/actions/streaming';
import type { WatchOffer } from '@/lib/streaming';
import { cn } from '@/lib/utils';

/**
 * The details' "Where to watch" (5.1), loaded lazily when the dialog opens:
 * stream / rent / buy, your services first and highlighted. TMDB requires
 * crediting JustWatch for this data.
 */
export function WhereToWatch({ activityId }: { activityId: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadWhereToWatch(activityId)
      .then((res) => {
        if (!live) return;
        if (res.ok && res.result) setResult(res.result);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [activityId]);

  if (!failed && result?.status === 'none') return null;

  return (
    <section className="space-y-2" aria-labelledby={`watch-${activityId}`}>
      <h3 id={`watch-${activityId}`} className="flex items-center gap-1.5 text-sm font-medium">
        <MonitorPlay className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Where to watch
      </h3>
      {failed || result?.status === 'unavailable' ? (
        <p className="text-xs text-muted-foreground">Couldn&apos;t load streaming info right now.</p>
      ) : !result ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Looking it up…
        </p>
      ) : result.status === 'not-configured' ? (
        <p className="text-xs text-muted-foreground">Streaming info isn&apos;t configured on this server (no TMDB key).</p>
      ) : result.status === 'no-region' ? (
        <p className="text-xs text-muted-foreground">
          Choose your region in{' '}
          <Link href="/settings" className="underline underline-offset-2">
            Settings
          </Link>{' '}
          to see where to stream.
        </p>
      ) : result.status === 'ok' ? (
        <Offers result={result} />
      ) : null}
    </section>
  );
}

function Offers({ result }: { result: Extract<Result, { status: 'ok' }> }) {
  const { providers, mine } = result;
  const groups = [
    { label: 'Stream', offers: providers.stream },
    { label: 'Rent', offers: providers.rent },
    { label: 'Buy', offers: providers.buy },
  ].filter((g) => g.offers.length > 0);
  const mineSet = new Set(mine);

  return (
    <div className="space-y-2">
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">Not available to stream, rent or buy in your region.</p>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="flex flex-wrap items-center gap-1.5">
            <span className="w-12 shrink-0 text-xs text-muted-foreground">{g.label}</span>
            {g.offers.map((o) => (
              <OfferChip key={`${g.label}:${o.id ?? o.name}`} offer={o} mine={mineSet.has(o.name)} />
            ))}
          </div>
        ))
      )}
      <p className="text-[11px] text-muted-foreground">
        {providers.source === 'tmdb' ? (
          <>
            Streaming data by JustWatch, via TMDB.
            {providers.link && (
              <>
                {' '}
                <a href={providers.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
                  All offers
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </>
            )}
          </>
        ) : (
          'Official streaming links from AniList.'
        )}
      </p>
    </div>
  );
}

function OfferChip({ offer, mine }: { offer: WatchOffer; mine: boolean }) {
  const body = (
    <>
      {offer.logo && (
        <Image src={offer.logo} alt="" width={16} height={16} className="h-4 w-4 rounded-sm object-cover" />
      )}
      <span className="max-w-[10rem] truncate">{offer.name}</span>
    </>
  );
  const cls = cn(
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
    mine
      ? 'border-emerald-500/50 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300'
      : 'border-border text-muted-foreground',
  );
  return offer.url ? (
    <a href={offer.url} target="_blank" rel="noopener noreferrer" className={cn(cls, 'hover:text-foreground')} title={mine ? `${offer.name} (yours)` : offer.name}>
      {body}
    </a>
  ) : (
    <span className={cls} title={mine ? `${offer.name} (yours)` : offer.name}>
      {body}
    </span>
  );
}
