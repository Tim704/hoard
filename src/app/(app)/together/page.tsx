import Link from 'next/link';
import { Users } from 'lucide-react';

import { TogetherClient } from '@/components/together-client';
import { Button } from '@/components/ui/button';
import { CATEGORY_LIST } from '@/lib/categories';
import { getPrefs } from '@/lib/data-prefs';
import { comparableUsernames } from '@/lib/data-together';
import { requireUser } from '@/lib/session';
import { settingsHref } from '@/lib/settings-nav';

export const metadata = { title: 'Watch together · Hoard' };
export const dynamic = 'force-dynamic';

/**
 * Watch together (5.8): what you and another user both have planned, best
 * first. Opt-in on both sides; the page only lists opted-in usernames.
 */
export default async function TogetherPage() {
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  const hidden = new Set<string>(prefs.hiddenSections);
  const sections = CATEGORY_LIST.map((c) => c.slug).filter((s) => !hidden.has(s));
  const users = prefs.compareOptIn ? await comparableUsernames(user.id) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Users className="h-6 w-6 text-sky-500" aria-hidden />
          Watch together
        </h1>
        <p className="text-sm text-muted-foreground">
          The titles you and someone else both have planned, ranked by how high they sit in both your queues.
        </p>
      </header>

      {!prefs.compareOptIn ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-sm">
          <p>
            Comparing is off for you. Watch together only works between users who both turned on{' '}
            <strong>Let other users of this Hoard compare with me</strong>. Others then see your username and the
            planned titles you share with them, nothing else.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={settingsHref('sharing', 'compare')}>Open Settings</Link>
          </Button>
        </div>
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nobody else has turned comparing on yet. Once another user of this Hoard does, they show up here.
        </p>
      ) : (
        <TogetherClient users={users} sections={sections} />
      )}
    </div>
  );
}
