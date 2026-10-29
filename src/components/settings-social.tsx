'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → the two sharing opt-ins: Compare (5.8 / 9.1), which lets other
//  opted-in users run Compare and Watch together with you, and the activity
//  Feed (9.2). Both save on change through `updatePrefs`.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Users } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { settle } from '@/lib/action-result';
import { updatePrefs } from '@/lib/actions/prefs';

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
      const res = await settle(updatePrefs(field === 'compareOptIn' ? { compareOptIn: next } : { feedOptIn: next }));
      if (res.ok) toast.success(next ? onMessage : offMessage);
      else {
        setOn(!next);
        toast.error(res.error ?? 'Could not save that setting.');
      }
    });
  }

  return (
    <Card id={id} className="scroll-mt-bar">
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
