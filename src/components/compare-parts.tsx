import Image from 'next/image';
import Link from 'next/link';
import { ImageOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { settingsHref } from '@/lib/settings-nav';

// ───────────────────────────────────────────────────────────────────────────
//  Small server-rendered pieces shared by /compare, /compare/[username] and
//  /feed (9.1 / 9.2).
// ───────────────────────────────────────────────────────────────────────────

/** Shown while the viewer's own compare opt-in is off (reveals nothing about others). */
export function CompareOffNotice() {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-sm">
      <p>
        Comparing is off for you. It only works between users who both turned on{' '}
        <strong>Let other users of this Hoard compare with me</strong> in Settings.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href={settingsHref('sharing', 'compare')}>Open Settings</Link>
      </Button>
    </div>
  );
}

/** The one answer for an unknown, opted-out or otherwise unavailable user. */
export function CompareUnavailable() {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-sm">
      <p>That user isn’t available to compare with.</p>
      <Button asChild variant="outline" size="sm">
        <Link href="/compare">Back to Compare</Link>
      </Button>
    </div>
  );
}

/** A small cover (44×64) with the usual "no image" fallback. */
export function Cover({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border">
      {src ? (
        <Image src={src} alt={alt} fill sizes="44px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
      )}
    </div>
  );
}
