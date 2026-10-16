import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ListOrdered, Swords } from 'lucide-react';

import { Arena } from '@/components/arena';
import { RankBoard } from '@/components/rank-board';
import { RankingList } from '@/components/ranking-list';
import { getCategory } from '@/lib/categories';
import { getMatchup, getRankBoard, getRanking } from '@/lib/data';
import { cn } from '@/lib/utils';

interface RankPageProps {
  params: { category: string };
  searchParams: { tab?: string };
}

/**
 * The per-category ranking page. "My ranking" is the drag-and-drop editor;
 * "Arena" runs head-to-head duels that refine the same order.
 */
export default async function RankPage({ params, searchParams }: RankPageProps) {
  const config = getCategory(params.category);
  if (!config) notFound();

  const slug = config.slug;
  const tab = searchParams.tab === 'arena' ? 'arena' : 'ranking';

  const tabs = [
    { id: 'ranking', label: 'My ranking', icon: ListOrdered, href: `/${slug}/arena` },
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
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Rank your {config.label.toLowerCase()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Put every {config.singular.toLowerCase()} in your exact order. The Arena
          helps when you can&apos;t decide.
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

      {tab === 'ranking' ? (
        <div className="max-w-3xl">
          <RankBoard slug={slug} initial={await getRankBoard(slug)} />
        </div>
      ) : (
        <ArenaTab slug={slug} />
      )}
    </div>
  );
}

async function ArenaTab({ slug }: { slug: Parameters<typeof getMatchup>[0] }) {
  const [initial, ranking] = await Promise.all([getMatchup(slug), getRanking(slug)]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
      <section>
        <Arena slug={slug} initial={initial} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Ranking</h2>
        <RankingList items={ranking} />
      </section>
    </div>
  );
}
