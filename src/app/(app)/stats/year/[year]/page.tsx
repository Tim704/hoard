import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crown, ImageOff, Layers, Swords } from 'lucide-react';

import { Score } from '@/components/prefs-provider';
import { FinishedPerMonthChart } from '@/components/stats/stats-charts';
import { StatsTabs } from '@/components/stats/stats-tabs';
import { AiVerdict, YearShare, type YearCard } from '@/components/stats/year-share';
import { CATEGORIES } from '@/lib/categories';
import { getPrefs } from '@/lib/data-prefs';
import { getYearReview, yearNow } from '@/lib/data-stats';
import { requireUser } from '@/lib/session';
import { HOURS_NOTE } from '@/lib/stats/measures';
import { sectionHex, sectionVar } from '@/lib/stats/palette';
import { MONTH_NAMES } from '@/lib/stats/year';
import { parseYear } from '@/lib/year-arena';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Year in review · Hoard' };

/**
 * `/stats/year/[year]` (spec 6.1): one year from the diary — totals and
 * metrics, new S-tier titles, the best-of-year top 3, the top franchise, the
 * busiest month, an optional AI verdict, and sharing (PNG and a link).
 */
export default async function YearInReviewPage({ params }: { params: { year: string } }) {
  const year = parseYear(params.year);
  if (year === null) notFound();
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  const cy = yearNow(prefs);
  const review = await getYearReview(user.id, year, prefs);
  const { summary: s, topThree } = review;
  const years = [...new Set([year, cy, ...review.years])].sort((a, b) => b - a);

  const card: YearCard = {
    year,
    finished: s.finished,
    hours: s.hours,
    pages: s.pages,
    episodes: s.episodes,
    sections: s.sections.map((x) => ({ label: CATEGORIES[x.slug].label, finished: x.finished, color: sectionHex(x.slug) })),
    busiestMonth: s.busiestMonth ? MONTH_NAMES[s.busiestMonth.month - 1] : null,
    topFranchise: s.topFranchise?.name ?? null,
    sTier: s.sTier.slice(0, 12).map((t) => ({ title: t.media.title, imageUrl: t.media.imageUrl })),
    topThree: topThree.map((t) => ({ title: t.title, imageUrl: t.imageUrl })),
  };

  const tiles: { label: string; value: React.ReactNode; show: boolean }[] = [
    { label: s.finishes > s.finished ? `titles finished (${s.finishes} with repeats)` : 'titles finished', value: s.finished.toLocaleString('en-US'), show: true },
    { label: 'hours watched', value: s.hours.toLocaleString('en-US'), show: s.hours > 0 },
    { label: 'pages read', value: s.pages.toLocaleString('en-US'), show: s.pages > 0 },
    { label: 'episodes watched', value: s.episodes.toLocaleString('en-US'), show: s.episodes > 0 },
    { label: 'chapters read', value: s.chapters.toLocaleString('en-US'), show: s.chapters > 0 },
    { label: 'average score', value: <Score value={s.avgScore} />, show: s.avgScore != null },
  ];

  return (
    <div className="mx-auto max-w-6xl px-[var(--page-pad)] py-6 sm:py-10">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{year} in review</h1>
        <p className="mt-1 text-muted-foreground">Everything you finished in {year}, from your diary.</p>
      </header>
      <StatsTabs active="year" currentYear={cy} />

      <nav aria-label="Year" className="mb-6 flex flex-wrap gap-1.5">
        {years.map((y) => (
          <Link
            key={y}
            href={`/stats/year/${y}`}
            aria-current={y === year ? 'page' : undefined}
            className={cn(
              'rounded-md border px-2.5 py-1 text-sm font-medium tabular-nums transition-colors',
              y === year ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {y}
          </Link>
        ))}
      </nav>

      {s.finished === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing finished in {year} yet. Finished titles land in your <Link href="/diary" className="underline underline-offset-2">diary</Link> and show up here.
        </p>
      ) : (
        <div className="space-y-6">
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles
              .filter((t) => t.show)
              .map((t) => (
                <div key={t.label} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-2xl font-bold tabular-nums">{t.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.label}</p>
                </div>
              ))}
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-semibold">By section</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {s.sections.map((x) => (
                  <li key={x.slug} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: sectionVar(x.slug) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{CATEGORIES[x.slug].label}</span>
                    <span className="tabular-nums font-semibold">{x.finished}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                      <Score value={x.avgScore} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-semibold">Highlights</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Busiest month</dt>
                  <dd className="font-medium">
                    {s.busiestMonth ? `${MONTH_NAMES[s.busiestMonth.month - 1]} · ${s.busiestMonth.finishes} finished` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Layers className="h-3 w-3" aria-hidden />
                    Top franchise
                  </dt>
                  <dd className="font-medium">
                    {s.topFranchise ? `${s.topFranchise.name} · ${s.topFranchise.count} ${s.topFranchise.count === 1 ? 'title' : 'titles'}` : '—'}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">{HOURS_NOTE}</p>
            </section>
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Crown className="h-4 w-4 text-amber-500" aria-hidden />
                Top 3 of {year}
              </h2>
              {topThree.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Duel this year&apos;s finishes in the{' '}
                  <Link href={`/arena/year/${year}`} className="underline underline-offset-2">
                    best-of-{year} Arena
                  </Link>{' '}
                  to crown a top 3.
                </p>
              ) : (
                <>
                  <Covers items={topThree.map((t) => ({ key: t.id, title: t.title, imageUrl: t.imageUrl }))} numbered />
                  <Link href={`/arena/year/${year}`} className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
                    <Swords className="h-3 w-3" aria-hidden />
                    Keep dueling
                  </Link>
                </>
              )}
            </section>
          </div>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">New in tier S</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Finished in {year} and in your S tier now.</p>
            {s.sTier.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <Covers items={s.sTier.map((t) => ({ key: t.id, title: t.media.title, imageUrl: t.media.imageUrl }))} />
            )}
          </section>

          <FinishedPerMonthChart sections={review.perMonth.sections} months={review.perMonth.months} year={year} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-semibold">Share your year</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">An image, or a read-only link without scores or notes.</p>
              <YearShare card={card} />
            </section>
            <AiVerdict year={year} />
          </div>
        </div>
      )}
    </div>
  );
}

function Covers({ items, numbered }: { items: { key: string; title: string; imageUrl: string | null }[]; numbered?: boolean }) {
  return (
    <ol className="mt-3 flex flex-wrap gap-3">
      {items.map((it, i) => (
        <li key={it.key} className="w-16 sm:w-20">
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded bg-muted ring-1 ring-border">
            {it.imageUrl ? (
              <Image src={it.imageUrl} alt="" fill sizes="80px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
            )}
            {numbered && (
              <span className="absolute left-1 top-1 rounded bg-background/85 px-1 text-[10px] font-bold">{i + 1}</span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-tight sm:text-xs">{it.title}</p>
        </li>
      ))}
    </ol>
  );
}
