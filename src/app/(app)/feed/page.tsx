import Link from 'next/link';
import { Ban, CheckCircle2, Crown, Lock, Rss } from 'lucide-react';

import { Cover } from '@/components/compare-parts';
import { Score } from '@/components/prefs-provider';
import { TitleLink } from '@/components/title/title-link';
import { Button } from '@/components/ui/button';
import { CATEGORIES } from '@/lib/categories';
import { getFeedPage, type FeedItem } from '@/lib/data-feed';
import { getPrefs } from '@/lib/data-prefs';
import { decodeCursor, encodeCursor, FEED_DAYS, mergeMoments, relativeTime, type FeedKind } from '@/lib/feed';
import { requireUser } from '@/lib/session';
import { doneVerb } from '@/lib/status';
import { settingsHref } from '@/lib/settings-nav';

export const metadata = { title: 'Feed · Hoard' };
export const dynamic = 'force-dynamic';

/** Empty pages followed on the server before offering "Load more". */
const AUTO_CONTINUE = 5;

/**
 * The activity feed (9.2): finishes, drops and new S-tier placements of the
 * last 30 days by users who opted in (you too, only if you did). Built per
 * request from the owners' own rows, so an opt-out applies at once.
 */
export default async function FeedPage({ searchParams }: { searchParams: { cursor?: string | string[] } }) {
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  const cursor = decodeCursor(searchParams.cursor);
  const now = new Date();
  // A page can come back empty but with a `next` (a capped source moved the
  // cursor back to its horizon): follow it a few times before showing it.
  let { items, next } = await getFeedPage(user.id, prefs, cursor, now);
  for (let hop = 0; items.length === 0 && next && hop < AUTO_CONTINUE; hop++) {
    ({ items, next } = await getFeedPage(user.id, prefs, next, now));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-[var(--page-pad)] py-4 sm:py-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Rss className="h-6 w-6 text-orange-500" aria-hidden />
          Feed
        </h1>
        <p className="text-sm text-muted-foreground">
          What people on this Hoard finished, dropped or put in S tier over the last {FEED_DAYS} days. Only users who
          turned the feed on show up here.
        </p>
      </header>

      {!prefs.feedOptIn && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>Your own activity isn’t in the feed. Turn on “Show my activity in the feed” to share it.</p>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={settingsHref('sharing', 'feed')}>Open Settings</Link>
          </Button>
        </div>
      )}

      {items.length === 0 && next ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Still looking through older activity. Load more to keep going.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {cursor ? 'No older activity.' : `Nothing in the feed from the last ${FEED_DAYS} days yet.`}
        </p>
      ) : (
        <ol className="space-y-2">
          {/* A finish and its S-tier placement the same day: one row. */}
          {mergeMoments(items).map((item, i) => (
            <FeedRow key={i} item={item} now={now} />
          ))}
        </ol>
      )}

      {(cursor || next) && (
        <nav className="flex justify-between gap-3" aria-label="Feed pages">
          {cursor ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/feed">Newest</Link>
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/feed?cursor=${encodeURIComponent(encodeCursor(next))}`}>
                {items.length === 0 ? 'Load more' : 'Older'}
              </Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}

const KIND = {
  finish: { icon: CheckCircle2, className: 'text-emerald-500' },
  drop: { icon: Ban, className: 'text-rose-500' },
  's-tier': { icon: Crown, className: 'text-amber-500' },
} as const;

type FeedRowItem = FeedItem & { kinds: FeedKind[] };

function verb(kind: FeedKind, item: FeedItem): string {
  if (kind === 's-tier') return 'put in S tier';
  if (kind === 'drop') return 'dropped';
  // The per-medium past tense ("watched", "read", "played"), as a verb before the title.
  const done = item.slug === 'music' ? 'listened to' : doneVerb(item.slug).toLowerCase();
  return done;
}

function FeedRow({ item, now }: { item: FeedRowItem; now: Date }) {
  const at = new Date(item.at);
  const scored = item.kinds.some((k) => k !== 's-tier');
  return (
    <li className="relative flex items-center gap-3 rounded-lg border border-border bg-card p-2 pr-3">
      <Cover src={item.imageUrl} alt={item.title} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.kinds.map((k) => {
            const { icon: Icon, className } = KIND[k];
            return <Icon key={k} className={`h-3.5 w-3.5 shrink-0 ${className}`} aria-hidden />;
          })}
          <span className="truncate">
            <span className="font-medium text-foreground">{item.isMe ? 'You' : item.username}</span>{' '}
            {item.kinds.map((k) => verb(k, item)).join(' and ')}
          </span>
        </p>
        {item.myActivityId ? (
          // You have it too: the whole row opens your copy.
          <TitleLink
            slug={item.slug}
            id={item.myActivityId}
            className="line-clamp-2 break-words font-medium after:absolute after:inset-0 after:rounded-lg after:content-[''] sm:line-clamp-none sm:truncate"
          >
            {item.title}
          </TitleLink>
        ) : (
          <p className="line-clamp-2 break-words font-medium sm:line-clamp-none sm:truncate">{item.title}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {[CATEGORIES[item.slug].singular, item.year, item.kinds.includes('finish') && item.rewatch ? 'again' : null]
            .filter(Boolean)
            .join(' · ')}{' '}
          ·{' '}
          <time dateTime={item.at} title={at.toISOString().slice(0, 16).replace('T', ' ')}>
            {relativeTime(at, now)}
          </time>
        </p>
      </div>
      {item.sealed && (
        // Their pick for you: their score waits for yours.
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Score it to see theirs">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Score hidden until you score it</span>
        </span>
      )}
      {scored && item.rating !== null && (
        <span className="shrink-0 text-sm tabular-nums">
          <span className="text-xs text-muted-foreground">scored </span>
          <span className="font-semibold">
            <Score value={item.rating} />
          </span>
        </span>
      )}
    </li>
  );
}
