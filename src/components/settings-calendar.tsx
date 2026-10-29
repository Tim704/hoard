'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Calendar (spec 5.6): the private iCal feed link. Create it,
//  copy it into a calendar app, regenerate it (the old link stops working)
//  or turn it off.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarPlus, Copy, Link2Off, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { settle } from '@/lib/action-result';
import { createCalendarLink, revokeCalendarLink } from '@/lib/actions/calendar';

export function SettingsCalendar({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [isPending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const res = await settle(createCalendarLink());
      if (res.ok && res.url) {
        const replaced = url !== null;
        setUrl(res.url);
        toast.success(replaced ? 'New link made. The old one no longer works.' : 'Calendar link ready.');
      } else {
        toast.error(res.error ?? 'Could not create the link.');
      }
    });
  }

  function revoke() {
    startTransition(async () => {
      const res = await settle(revokeCalendarLink());
      if (res.ok) {
        setUrl(null);
        toast.success('Calendar link turned off.');
      } else {
        toast.error(res.error ?? 'Could not turn the link off.');
      }
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.');
    }
  }

  return (
    <Card id="calendar" className="scroll-mt-bar">
      <CardHeader>
        <CardTitle className="text-base">Calendar</CardTitle>
        <CardDescription>
          Subscribe to your <Link href="/calendar" className="underline underline-offset-2">calendar</Link> (releases,
          next episodes, announced sequels) from Google Calendar, Apple Calendar or any app that takes an iCal
          link. Anyone with the link can see those dates, so keep it private.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {url ? (
          <>
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Private calendar link" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void copy()}>
                <Copy className="mr-2 h-4 w-4" aria-hidden />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={create} disabled={isPending}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                Regenerate
              </Button>
              <Button variant="outline" size="sm" onClick={revoke} disabled={isPending}>
                <Link2Off className="mr-2 h-4 w-4" aria-hidden />
                Turn off
              </Button>
            </div>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={create} disabled={isPending}>
            <CalendarPlus className="mr-2 h-4 w-4" aria-hidden />
            Create private calendar link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
