import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { getCategory } from '@/lib/categories';
import { getMatchup, getRanking } from '@/lib/data';
import { Arena } from '@/components/arena';
import { RankingList } from '@/components/ranking-list';

interface ArenaPageProps {
  params: { category: string };
}

export default async function ArenaPage({ params }: ArenaPageProps) {
  const config = getCategory(params.category);
  if (!config) notFound();

  const slug = config.slug;
  const [initial, ranking] = await Promise.all([getMatchup(slug), getRanking(slug)]);

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
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{config.label} Arena</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a winner between equally-rated items to forge your ranking.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <section>
          <Arena slug={slug} initial={initial} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Ranking</h2>
          <RankingList items={ranking} />
        </section>
      </div>
    </div>
  );
}
