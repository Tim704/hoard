import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ListTodo, Rows3, Swords } from 'lucide-react';

import { Arena } from '@/components/arena';
import { RankingList } from '@/components/ranking-list';
import { TierBoard } from '@/components/tier-board';
import { UpNext } from '@/components/up-next';
import { getCategory } from '@/lib/categories';
import { TierShare } from '@/components/tier-share';
import { getChallengeMatchup, getMatchup, getQueue, getQueueHints, getRanking, getTierBoard } from '@/lib/data';
import { cn } from '@/lib/utils';

interface RankPageProps {
  params: { category: string };
  searchParams: { tab?: string; mode?: string };
}

/**
 * The per-category ranking page. "Tiers" is the hand-placed S–F tier list;
 * "Up next" is the queue; "Arena" runs duels that refine order inside a tier.
 */
export default async function RankPage({ params, searchParams }: RankPageProps) {
  const config = getCategory(params.category);
  if (!config) notFound();

  const slug = config.slug;
  const tab =
    searchParams.tab === 'arena' ? 'arena' : searchParams.tab === 'queue' ? 'queue' : 'tiers';

  const tabs = [
    { id: 'tiers', label: 'Tiers', icon: Rows3, href: `/${slug}/arena` },
    { id: 'queue', label: 'Up next', icon: ListTodo, href: `/${slug}/arena?tab=queue` },
    { id: 'arena', label: 'Arena', icon: Swords, href: `/${slug}/arena?tab=arena` },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-6">
        <Link
          href={`/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to {config.label}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Tier your {config.label.toLowerCase()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Place every finished {config.singular.toLowerCase()} in a tier from S to F. The
          Arena helps order a tier when you can&apos;t decide.
        </p>

        <div className="mt-4 inline-flex rounded-md border border-border bg-muted/40 p-0.5">
          {tabs.map(({ id, label, icon: Icon, href }) => (
            <Link
              key={id}
              href={href}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                tab === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {tab === 'tiers' ? (
        <TiersTab slug={slug} label={config.label} />
      ) : tab === 'queue' ? (
        <div className="max-w-3xl">
          <QueueTab slug={slug} />
        </div>
      ) : (
        <ArenaTab slug={slug} mode={searchParams.mode === 'challenge' ? 'challenge' : 'order'} />
      )}
    </div>
  );
}

type Slug = Parameters<typeof getMatchup>[0];

async function TiersTab({ slug, label }: { slug: Slug; label: string }) {
  const board = await getTierBoard(slug);
  return (
    <div className="max-w-3xl space-y-4">
      <TierShare slug={slug} label={label} board={board} />
      <TierBoard slug={slug} initial={board} />
    </div>
  );
}

async function QueueTab({ slug }: { slug: Slug }) {
  const queue = await getQueue(slug);
  return <UpNext slug={slug} initial={queue} hints={await getQueueHints(queue)} />;
}

async function ArenaTab({ slug, mode }: { slug: Slug; mode: 'order' | 'challenge' }) {
  const [initial, ranking] = await Promise.all([
    mode === 'challenge' ? getChallengeMatchup(slug) : getMatchup(slug),
    getRanking(slug),
  ]);
  const modes = [
    { id: 'order', label: 'Order tiers', href: `/${slug}/arena?tab=arena` },
    { id: 'challenge', label: 'Challenge tiers', href: `/${slug}/arena?tab=arena&mode=challenge` },
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
      <section className="space-y-4">
        <div className="flex justify-center">
          <div role="group" aria-label="Arena mode" className="inline-flex rounded-md border border-border p-0.5">
            {modes.map((m) => (
              <Link
                key={m.id}
                href={m.href}
                aria-current={mode === m.id ? 'page' : undefined}
                className={cn(
                  'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  mode === m.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m.label}
              </Link>
            ))}
          </div>
        </div>
        {/* Keyed by mode: switching starts a fresh session (and challenge history). */}
        <Arena key={mode} slug={slug} initial={initial} mode={mode} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Ranking</h2>
        <RankingList items={ranking} />
      </section>
    </div>
  );
}
