import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, GitCompareArrows } from 'lucide-react';

import { CompareOffNotice, CompareUnavailable, Cover } from '@/components/compare-parts';
import { CompareSTier } from '@/components/compare-s-tier';
import { Score } from '@/components/prefs-provider';
import { CATEGORIES } from '@/lib/categories';
import { MIN_SHARED_SCORES } from '@/lib/compare';
import { compareLibraries, SHARED_LIST_LIMIT, type SharedView } from '@/lib/data-compare';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Compare · Hoard' };
export const dynamic = 'force-dynamic';

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

/**
 * Compare with one user (9.1). Both opt-ins are re-checked on every request
 * (compareLibraries); anyone unknown or opted out gets the same "not
 * available" answer. Comparing with yourself goes to your stats.
 */
export default async function CompareUserPage({ params }: { params: { username: string } }) {
  const user = await requireUser();
  const username = decode(params.username);
  if (username === user.username) redirect('/stats');

  const view = await compareLibraries(user.id, username);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <header className="space-y-2">
        <Link href="/compare" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Compare
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <GitCompareArrows className="h-6 w-6 text-violet-500" aria-hidden />
          {view.ok ? <span className="min-w-0 truncate">You and {view.them}</span> : 'Compare'}
        </h1>
      </header>

      {!view.ok ? (
        view.reason === 'me-off' ? <CompareOffNotice /> : <CompareUnavailable />
      ) : (
        <>
          <section aria-labelledby="cmp-score" className="rounded-xl border border-border bg-card p-5">
            <h2 id="cmp-score" className="text-sm font-medium text-muted-foreground">
              Compatibility
            </h2>
            {view.compatibility.score !== null ? (
              <>
                <p className="mt-1 text-4xl font-bold tabular-nums">{view.compatibility.score}%</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  How closely your scores move together across the {view.compatibility.shared} titles you both
                  scored (50% means no link either way).
                </p>
              </>
            ) : view.compatibility.reason === 'too-few' ? (
              <p className="mt-1 text-sm">
                Not enough shared scores yet ({view.compatibility.shared}/{MIN_SHARED_SCORES}).
              </p>
            ) : (
              <p className="mt-1 text-sm">
                No score yet: one of you gave every shared title the same score.
              </p>
            )}
          </section>

          <section aria-labelledby="cmp-gaps" className="space-y-3">
            <h2 id="cmp-gaps" className="text-lg font-semibold">
              Biggest disagreements
            </h2>
            {view.disagreements.length === 0 ? (
              <Empty>No titles you both scored differently yet.</Empty>
            ) : (
              <ol className="space-y-2">
                {view.disagreements.map((d) => (
                  <SharedRow key={`${d.slug}:${d.myActivityId}`} item={d} them={view.them} />
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="cmp-s" className="space-y-3">
            <h2 id="cmp-s" className="text-lg font-semibold">
              Their S tier you haven’t got
            </h2>
            {view.theirS.length === 0 ? (
              <Empty>Nothing: you already have everything in {view.them}’s S tier.</Empty>
            ) : (
              <CompareSTier items={view.theirS} />
            )}
          </section>

          <section aria-labelledby="cmp-shared" className="space-y-3">
            <h2 id="cmp-shared" className="text-lg font-semibold">
              Titles you both have <span className="font-normal text-muted-foreground">({view.sharedTotal})</span>
            </h2>
            {view.shared.length === 0 ? (
              <Empty>No titles in common yet.</Empty>
            ) : (
              <>
                <ul className="space-y-2">
                  {view.shared.map((s) => (
                    <SharedRow key={`${s.slug}:${s.myActivityId}`} item={s} them={view.them} />
                  ))}
                </ul>
                {view.sharedTotal > SHARED_LIST_LIMIT && (
                  <p className="text-xs text-muted-foreground">
                    Showing the first {SHARED_LIST_LIMIT} of {view.sharedTotal}.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** One shared title: cover, title, section · year, and both scores side by side. */
function SharedRow({ item, them }: { item: SharedView; them: string }) {
  return (
    <li>
      <Link
        href={`/${item.slug}?open=${encodeURIComponent(item.myActivityId)}`}
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 pr-3 transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Cover src={item.imageUrl} alt={item.title} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {[CATEGORIES[item.slug].singular, item.year].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-x-3 text-right text-sm tabular-nums">
          <span className="text-[11px] text-muted-foreground">You</span>
          <span className="max-w-[5rem] truncate text-[11px] text-muted-foreground">{them}</span>
          <span className="font-semibold" aria-label="Your score">
            <Score value={item.myRating} />
          </span>
          <span className="font-semibold" aria-label={`${them}’s score`}>
            <Score value={item.theirRating} />
          </span>
        </div>
      </Link>
    </li>
  );
}
