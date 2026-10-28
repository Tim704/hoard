import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImageOff } from 'lucide-react';

import { TIER_HEX } from '@/components/tier-colors';
import { loadPublicShare, type ListShareView, type TiersShareView } from '@/lib/data-share';

// Public, read-only share pages (spec 4.1). Outside the (app) group: no login,
// no sidebar. A revoked link must stop working at once, so never cache.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'A shared list · Hoard',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SharePage({ params }: { params: { token: string } }) {
  // Unknown, malformed and revoked tokens all get the same 404.
  const view = await loadPublicShare(params.token);
  if (!view) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {view.kind === 'tiers' && <SharedTiers view={view} />}
      {view.kind === 'list' && <SharedList view={view} />}
      <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        Made with{' '}
        <Link href="/" className="font-semibold text-foreground underline-offset-4 hover:underline">
          Hoard
        </Link>
        , a tracker for everything you watch, read, play and hear.
      </footer>
    </main>
  );
}

function SharedTiers({ view }: { view: TiersShareView }) {
  const total = view.tiers.reduce((n, t) => n + t.items.length, 0);
  return (
    <>
      <header className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Shared from Hoard</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{view.sectionLabel} tier list</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} {total === 1 ? 'title' : 'titles'}, best first.
        </p>
      </header>
      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing has been placed in a tier yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {view.tiers.map(({ tier, items }) => (
            <li key={tier} className="flex overflow-hidden rounded-lg border border-border bg-card">
              <div
                className="flex w-12 shrink-0 items-center justify-center text-2xl font-black text-white sm:w-16 sm:text-3xl"
                style={{ backgroundColor: TIER_HEX[tier] }}
              >
                <span className="sr-only">Tier </span>
                {tier}
              </div>
              {items.length === 0 ? (
                <p className="flex min-h-[4.5rem] items-center px-3 text-sm text-muted-foreground">—</p>
              ) : (
                <ol className="flex min-w-0 flex-1 flex-wrap gap-2 p-2">
                  {items.map((item, i) => (
                    <li key={i} className="w-16 sm:w-20">
                      <div className="relative aspect-[2/3] w-full overflow-hidden rounded bg-muted ring-1 ring-border">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt=""
                            fill
                            sizes="80px"
                            referrerPolicy="no-referrer"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                          </div>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-tight sm:text-xs">{item.title}</p>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function SharedList({ view }: { view: ListShareView }) {
  return (
    <>
      <header className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Shared from Hoard</p>
        <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">{view.name}</h1>
        {view.description && <p className="mt-2 whitespace-pre-line text-sm">{view.description}</p>}
        <p className="mt-1 text-sm text-muted-foreground">
          {view.items.length} {view.items.length === 1 ? 'title' : 'titles'}
        </p>
      </header>
      {view.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          This list is empty for now.
        </p>
      ) : (
        <ol className="space-y-2">
          {view.items.map((item, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
              <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt="" fill sizes="40px" referrerPolicy="no-referrer" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </div>
                )}
              </div>
              <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{item.title}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
