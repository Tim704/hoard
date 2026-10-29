'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { LinkResult, PasteLinkField, SearchEverythingPanel } from '@/components/search-everything';
import { settle } from '@/lib/action-result';
import { resolveLink, type ResolveLinkResult } from '@/lib/actions/search';

/**
 * The /add page body: resolves the shared link once on arrival and shows its
 * add row (or the fallback search). Without a link, the title guess is
 * searched everywhere; a link field is always offered.
 */
export function AddByLink({ url, guess, sharedTitle }: { url: string | null; guess: string; sharedTitle?: string }) {
  const [resolution, setResolution] = useState<ResolveLinkResult | null>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    void settle(resolveLink(url)).then((res) => live && setResolution(res));
    return () => {
      live = false;
    };
  }, [url]);

  if (!url) {
    return (
      <div className="space-y-6">
        <PasteLinkField />
        <SearchEverythingPanel initialQuery={guess} autoFocus={!guess} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section aria-label="The shared link" className="space-y-2">
        <p className="break-all text-xs text-muted-foreground">{url}</p>
        {resolution ? (
          <LinkResult resolution={resolution} fallbackQuery={guess} sharedTitle={sharedTitle} />
        ) : (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Looking that link up…
          </div>
        )}
      </section>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Use another link</summary>
        <div className="pt-3">
          <PasteLinkField />
        </div>
      </details>
    </div>
  );
}
