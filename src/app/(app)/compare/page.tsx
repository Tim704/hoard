import Link from 'next/link';
import { ChevronRight, GitCompareArrows } from 'lucide-react';

import { CompareOffNotice } from '@/components/compare-parts';
import { getPrefs } from '@/lib/data-prefs';
import { comparableUsernames } from '@/lib/data-together';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Compare · Hoard' };
export const dynamic = 'force-dynamic';

/**
 * Compare (9.1): the other users you can compare libraries with. Opt-in on
 * both sides; only opted-in usernames are listed, and only to opted-in users.
 */
export default async function CompareIndexPage() {
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  const users = prefs.compareOptIn ? await comparableUsernames(user.id) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-[var(--page-pad)] py-4 sm:py-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <GitCompareArrows className="h-6 w-6 text-violet-500" aria-hidden />
          Compare
        </h1>
        <p className="text-sm text-muted-foreground">
          Put your library next to someone else’s: what you both have, where your scores differ most, how alike your
          taste is and what they love that you haven’t tried.
        </p>
      </header>

      {!prefs.compareOptIn ? (
        <CompareOffNotice />
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nobody else has turned comparing on yet. Once another user of this Hoard does, they show up here.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {users.map((u) => (
            <li key={u}>
              <Link
                href={`/compare/${encodeURIComponent(u)}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">{u}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
