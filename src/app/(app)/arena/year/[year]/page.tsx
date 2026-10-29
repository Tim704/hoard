import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { RankingList } from '@/components/ranking-list';
import { YearArena } from '@/components/year-arena';
import { getYearArenaPage } from '@/lib/data-year';
import { parseYear } from '@/lib/year-arena';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Best of the year · Hoard' };

/**
 * `/arena/year/[year]` (spec 4.6): duel everything you finished in a year,
 * across all sections, and see the year's ranking beside it.
 */
export default async function YearArenaPage({ params }: { params: { year: string } }) {
  const year = parseYear(params.year);
  if (year === null) notFound();
  const data = await getYearArenaPage(year);
  if (!data) notFound();
  // The picker: years with diary entries, plus the one being viewed.
  const years = [...new Set([year, ...data.years])].sort((a, b) => b - a);

  return (
    <div className="mx-auto max-w-5xl px-[var(--page-pad)] py-4 sm:py-6">
      <div className="mb-6">
        <Link
          href="/diary"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to the diary
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Best of {year}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you finished in {year}, from every section, head to head.
        </p>
        <nav aria-label="Year" className="mt-4 flex flex-wrap gap-1.5">
          {years.map((y) => (
            <Link
              key={y}
              href={`/arena/year/${y}`}
              aria-current={y === year ? 'page' : undefined}
              className={cn(
                'rounded-md border px-2.5 py-1 text-sm font-medium tabular-nums transition-colors',
                y === year
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {y}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <section>
          <YearArena key={year} year={year} initial={data.matchup} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Ranking <span className="text-sm font-normal text-muted-foreground">· {data.ranking.length}</span>
          </h2>
          <RankingList items={data.ranking} />
        </section>
      </div>
    </div>
  );
}
