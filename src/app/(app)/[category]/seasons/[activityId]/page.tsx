import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { RankedSeasonList, SeasonArena, SeasonTierBoard } from '@/components/season-tiers';
import { TitleLink } from '@/components/title/title-link';
import { getSeasonTierPage } from '@/lib/data-seasons';

interface SeasonPageProps {
  params: { category: string; activityId: string };
}

/**
 * `/tv/seasons/[activityId]` (spec 4.5): the S–F tier list of one show's
 * watched seasons, plus a season Arena within the show. TV only; anything
 * that isn't the caller's own TV title is a 404.
 */
export default async function SeasonTiersPage({ params }: SeasonPageProps) {
  if (params.category !== 'tv') notFound();
  const data = await getSeasonTierPage(params.activityId);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-6">
        <TitleLink
          slug="tv"
          id={data.activityId}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to {data.show.title}
        </TitleLink>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Tier the seasons of {data.show.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every season you have watched episodes of (or scored) can go in a tier from S to F. The
          Arena helps order a tier when you can&apos;t decide.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="season-tiers-heading" className="space-y-3">
          <h2 id="season-tiers-heading" className="text-lg font-semibold">
            Tiers
          </h2>
          <SeasonTierBoard activityId={data.activityId} initial={data.board} />
        </section>
        <section aria-labelledby="season-arena-heading" className="space-y-6">
          <h2 id="season-arena-heading" className="sr-only">
            Arena
          </h2>
          <SeasonArena key={data.activityId} activityId={data.activityId} initial={data.matchup} />
          {data.ranking.length > 0 && <RankedSeasonList items={data.ranking} />}
        </section>
      </div>
    </div>
  );
}
