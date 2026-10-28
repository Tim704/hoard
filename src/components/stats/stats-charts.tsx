'use client';

import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';

import { useScoreFormat } from '@/components/prefs-provider';
import {
  ChartCard,
  DataTable,
  DotLine,
  HBars,
  StackedColumns,
  StackedRows,
  VIZ,
  type Series,
} from '@/components/stats/chart-kit';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import { sectionVar } from '@/lib/stats/palette';
import { formatScoreDiff } from '@/lib/rating';
import { STATUSES, STATUS_BASE_LABEL, statusLabel, type Status } from '@/lib/status';
import type { CrowdOverview, DropRateRow, GenreRow, MonthColumn, StatusMixRow, YearScore } from '@/lib/stats/charts';
import { MONTH_NAMES, MONTH_SHORT } from '@/lib/stats/year';
import { cn } from '@/lib/utils';

/** A section's colour follows the section (navigation order), never its rank. */
const sectionColor = sectionVar;
const statusColor = (s: Status): string => VIZ[STATUSES.indexOf(s)] ?? VIZ[0];

const sectionSeries = (slugs: CategorySlug[]): Series[] =>
  slugs.map((slug) => ({ key: slug, label: CATEGORIES[slug].label, color: sectionColor(slug) }));

/** Finishes per month of one year, stacked by section (6.2). */
export function FinishedPerMonthChart({
  sections,
  months,
  year,
  years,
  yearHrefPrefix,
}: {
  sections: CategorySlug[];
  months: MonthColumn[];
  year: number;
  /** Years to pick from (none: no picker). */
  years?: number[];
  /** The URL of another year minus the year ("/stats?year="); the picker navigates there. */
  yearHrefPrefix?: string;
}) {
  const router = useRouter();
  const series = sectionSeries(sections);
  const total = months.reduce((n, m) => n + m.total, 0);
  const picker =
    years && yearHrefPrefix && years.length > 0 ? (
      <select
        aria-label="Year"
        value={year}
        onChange={(e) => router.push(`${yearHrefPrefix}${Number(e.target.value)}`)}
        className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
      >
        {[...new Set([year, ...years])]
          .sort((a, b) => b - a)
          .map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
      </select>
    ) : null;
  return (
    <ChartCard
      title={`Finished per month, ${year}`}
      subtitle={`${total} ${total === 1 ? 'finish' : 'finishes'} (a rewatch or re-read counts again)`}
      legend={series}
      actions={picker}
      empty={total === 0 ? `Nothing finished in ${year}.` : null}
      table={
        <DataTable
          head={['Month', ...series.map((s) => s.label), 'Total']}
          rows={months.map((m) => [MONTH_NAMES[m.month - 1], ...series.map((s) => m.counts[s.key as CategorySlug] ?? 0), m.total])}
        />
      }
    >
      <StackedColumns
        ariaLabel={`Titles finished per month in ${year}, by section`}
        unit="finished"
        series={series}
        columns={months.map((m) => ({
          key: String(m.month),
          label: MONTH_SHORT[m.month - 1],
          full: `${MONTH_NAMES[m.month - 1]} ${year}`,
          values: m.counts as Record<string, number>,
        }))}
      />
    </ChartCard>
  );
}

/** Top 10 genres of finished titles (6.2). */
export function GenresChart({ genres }: { genres: GenreRow[] }) {
  const { score } = useScoreFormat();
  return (
    <ChartCard
      title="Top genres"
      subtitle="Finished titles per genre, all sections"
      empty={genres.length === 0 ? 'No genres yet — they fill in as title details are fetched.' : null}
      table={<DataTable head={['Genre', 'Titles', 'Avg score']} rows={genres.map((g) => [g.genre, g.count, score(g.avgScore)])} />}
    >
      <HBars
        ariaLabel="Top genres by finished titles"
        rows={genres.map((g) => ({
          key: g.genre,
          label: g.genre,
          value: g.count,
          display: String(g.count),
          tip: (
            <span>
              {g.count} finished · average {score(g.avgScore)}
            </span>
          ),
        }))}
      />
    </ChartCard>
  );
}

/** Your average score of each year's finishes (6.2). */
export function ScoreByYearChart({ points }: { points: YearScore[] }) {
  const { score, format } = useScoreFormat();
  const tick = (v: number) => (format === 'hundred' ? String(v * 10) : format === 'five' ? String(v / 2) : String(v));
  return (
    <ChartCard
      title="Average score by year"
      subtitle="Of the titles you finished each year"
      empty={points.length === 0 ? 'No scored finishes yet.' : null}
      table={<DataTable head={['Year', 'Average', 'Scored finishes']} rows={points.map((p) => [p.year, score(p.avgScore), p.count])} />}
    >
      <DotLine
        ariaLabel="Average score by year"
        yMax={10}
        yTicks={[0, 5, 10]}
        formatTick={tick}
        points={points.map((p) => ({
          key: String(p.year),
          label: String(p.year),
          value: p.avgScore,
          text: `${p.year}: average ${score(p.avgScore)} over ${p.count} scored ${p.count === 1 ? 'finish' : 'finishes'}`,
        }))}
      />
    </ChartCard>
  );
}

/** How each section splits across the statuses (6.2). */
export function StatusMixChart({ rows }: { rows: StatusMixRow[] }) {
  const series: Series[] = STATUSES.map((s) => ({ key: s, label: STATUS_BASE_LABEL[s], color: statusColor(s) }));
  return (
    <ChartCard
      title="Status mix"
      subtitle="Every title per section, by status"
      legend={series}
      empty={rows.length === 0 ? 'Nothing tracked yet.' : null}
      table={
        <DataTable
          head={['Section', ...series.map((s) => s.label), 'Total']}
          rows={rows.map((r) => [CATEGORIES[r.slug].label, ...STATUSES.map((s) => r.counts[s]), r.total])}
        />
      }
    >
      <StackedRows
        ariaLabel="Status mix per section"
        series={series}
        rows={rows.map((r) => ({
          key: r.slug,
          label: CATEGORIES[r.slug].label,
          total: r.total,
          values: r.counts,
          seriesLabel: (s) => statusLabel(s.key as Status, r.slug),
        }))}
      />
    </ChartCard>
  );
}

/** Share of ended titles you dropped, per section (6.2). */
export function DropRateChart({ rows }: { rows: DropRateRow[] }) {
  const shown = rows.filter((r) => r.rate !== null);
  const pct = (r: DropRateRow) => `${Math.round((r.rate ?? 0) * 100)}%`;
  return (
    <ChartCard
      title="Drop rate"
      subtitle="Dropped ÷ (finished + retired + dropped)"
      empty={shown.length === 0 ? 'Nothing finished or dropped yet.' : null}
      table={
        <DataTable head={['Section', 'Dropped', 'Ended', 'Rate']} rows={shown.map((r) => [CATEGORIES[r.slug].label, r.dropped, r.ended, pct(r)])} />
      }
    >
      <HBars
        ariaLabel="Drop rate per section"
        max={1}
        rows={shown.map((r) => ({
          key: r.slug,
          label: CATEGORIES[r.slug].label,
          value: r.rate ?? 0,
          display: pct(r),
          tip: (
            <span>
              {r.dropped} of {r.ended} ended {r.ended === 1 ? 'title' : 'titles'} dropped
            </span>
          ),
        }))}
      />
    </ChartCard>
  );
}

const diffClass = (diff: number) =>
  diff > 0 ? 'text-emerald-700 dark:text-emerald-400' : diff < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground';

/** "You vs. the crowd" across every section (1.9 on the stats page). */
export function CrowdOverviewPanel({ crowd }: { crowd: CrowdOverview }) {
  const { score, format } = useScoreFormat();
  const diff = (d: number) => formatScoreDiff(d, format);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
        You vs. the crowd
      </h3>
      {crowd.count === 0 || crowd.meanDiff == null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Score some movies, shows, anime, manga or games to compare with their community scores (TMDB, MyAnimeList, IGDB).
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {Math.round(crowd.meanDiff * 10) === 0
              ? 'On average you score the same as the crowd'
              : `On average you score ${diff(Math.abs(crowd.meanDiff)).slice(1)} ${crowd.meanDiff > 0 ? 'higher' : 'lower'} than the crowd`}
            , across {crowd.count} {crowd.count === 1 ? 'title' : 'titles'}.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {crowd.sections.map((s) => (
              <li key={s.slug} className="rounded-md border border-border px-2 py-1 text-xs">
                <span className="text-muted-foreground">{CATEGORIES[s.slug].label}</span>{' '}
                <span className={cn('font-semibold tabular-nums', diffClass(s.meanDiff))}>{diff(s.meanDiff)}</span>
                <span className="text-muted-foreground"> · {s.count}</span>
              </li>
            ))}
          </ul>
          <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Biggest disagreements</h4>
          <ol className="mt-2 space-y-1.5">
            {crowd.top.map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate" title={r.title}>
                  {r.title}
                  <span className="ml-1.5 text-xs text-muted-foreground">{CATEGORIES[r.slug].singular}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="sr-only">You </span>
                  <span className="font-medium text-foreground">{score(r.yours)}</span>
                  <span aria-hidden> vs </span>
                  <span className="sr-only"> versus the crowd </span>
                  {score(r.crowd)}
                </span>
                <span className={cn('w-12 shrink-0 text-right font-semibold tabular-nums', diffClass(r.diff))}>{diff(r.diff)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
