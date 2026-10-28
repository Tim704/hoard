'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Sharing (spec 4.1): every public link you have made, with Copy
//  and Revoke. A revoked link answers "not found" from then on; making a new
//  one ("Share link" on a Tiers tab) gives a fresh address.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, ExternalLink, Link2Off } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { revokeShareLink } from '@/lib/actions/share';
import type { MyShareLink } from '@/lib/data-share';

export function SettingsSharing({ links }: { links: MyShareLink[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [revoked, setRevoked] = useState<Set<string>>(new Set());
  const shown = links.filter((l) => !revoked.has(l.id));

  function revoke(link: MyShareLink) {
    startTransition(async () => {
      const res = await revokeShareLink(link.id);
      if (res.ok) {
        setRevoked((prev) => new Set(prev).add(link.id));
        toast.success(`Revoked the ${link.label} link.`);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not revoke the link.');
      }
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.');
    }
  }

  return (
    <Card id="sharing">
      <CardHeader>
        <CardTitle className="text-base">Sharing</CardTitle>
        <CardDescription>
          Public read-only links. Anyone with a link sees only what it shows (a tier list: titles and
          covers), never your notes or the rest of your library.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active links. Use “Share link” on a section&apos;s Tiers tab to make one.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((link) => (
              <li key={link.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{link.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => void copy(link.url)} aria-label={`Copy the ${link.label} link`}>
                    <Copy className="h-4 w-4 sm:mr-2" aria-hidden />
                    <span className="hidden sm:inline">Copy</span>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={new URL(link.url).pathname} target="_blank" rel="noreferrer" aria-label={`Open the ${link.label} link`}>
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => revoke(link)} disabled={isPending}>
                    <Link2Off className="mr-2 h-4 w-4" aria-hidden />
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
