import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarCheck2, Flame, Info, Trophy } from 'lucide-react';

import { Score } from '@/components/prefs-provider';
import { RecommendAcrossButton } from '@/components/recommend-across';
import { ComparePeriods } from '@/components/stats/compare-periods';
import { GoalsClient } from '@/components/stats/goals-client';
import {
  CrowdOverviewPanel,
  DropRateChart,
  FinishedPerMonthChart,
  GenresChart,
  ScoreByYearChart,
  StatusMixChart,
} from '@/components/stats/stats-charts';
import { StatsTabs, type StatsTab } from '@/components/stats/stats-tabs';
import { TasteRefreshButton } from '@/components/stats/taste-refresh';
import { CATEGORIES, NAV_ORDER } from '@/lib/categories';
import { getPrefs } from '@/lib/data-prefs';
import { effectiveTimeZone, type Prefs } from '@/lib/prefs';
import {
  getGoalsProgress,
  getPeoplePage,
  getStatsOverview,
  getTastePage,
  type StatsOverview,
  type TastePage,
  yearNow,
} from '@/lib/data-stats';
import { getTasteProfile, type StoredTasteProfile } from '@/lib/data-taste';
import { formatYmd } from '@/lib/release';
import { requireUser } from '@/lib/session';
import { statusLabel } from '@/lib/status';
import { MIN_FINISHED_FOR_PROFILE, SECTION_NOUN, tasteSentences, withoutHidden } from '@/lib/stats/profile';
import { dropPointPhrase } from '@/lib/stats/taste';
import type { PersonRow } from '@/lib/stats/people';
import { parseYear } from '@/lib/year-arena';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Stats · Hoard' };

type Search = { tab?: string; year?: string; preset?: string; a1?: string; a2?: string; b1?: string; b2?: string };

/**
 * `/stats` (spec 6.x): Overview, Goals, Taste and People tabs (the Year tab
 * is /stats/year/[year]). Everything is computed per request from your own
 * rows.
 */
export default async function StatsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  const cy = yearNow(prefs);
  if (searchParams.tab === 'year') redirect(`/stats/year/${parseYear(searchParams.year) ?? cy}`);
  const tab: StatsTab =
    searchParams.tab === 'goals' || searchParams.tab === 'taste' || searchParams.tab === 'people' ? searchParams.tab : 'overview';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Stacked on phones, one row that never wraps from sm. */}
      <header className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Stats</h1>
          <p className="mt-1 text-muted-foreground">What your hoard says about you.</p>
        </div>
        <RecommendAcrossButton className="shrink-0" />
      </header>
      <StatsTabs active={tab} currentYear={cy} />
      {tab === 'overview' && <Overview data={await getStatsOverview(user.id, parseYear(searchParams.year), prefs)} />}
      {tab === 'goals' && <Goals userId={user.id} prefs={prefs} year={parseYear(searchParams.year) ?? cy} currentYear={cy} />}
      {tab === 'taste' && (
        <Taste
          data={await getTastePage(user.id, searchParams, prefs)}
          stored={await getTasteProfile(user.id)}
          prefs={prefs}
        />
      )}
      {tab === 'people' && <People data={await getPeoplePage(user.id, prefs)} />}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function Overview({ data }: { data: StatsOverview }) {
  const { streaks: s } = data;
  return (
    <div className="space-y-6">
      <section aria-label="Streaks" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={<Flame className="h-4 w-4 text-orange-500" aria-hidden />}
          label="Current streak"
          value={`${s.current} ${s.current === 1 ? 'day' : 'days'}`}
          hint={s.current > 0 ? 'Days in a row with any activity' : 'Log something today to start one'}
        />
        <StatTile
          icon={<Trophy className="h-4 w-4 text-amber-500" aria-hidden />}
          label="Longest streak"
          value={`${s.longest} ${s.longest === 1 ? 'day' : 'days'}`}
          hint={s.longestEnd ? `Ended ${formatYmd(s.longestEnd)}` : 'No activity yet'}
        />
        <StatTile
          icon={<CalendarCheck2 className="h-4 w-4 text-sky-500" aria-hidden />}
          label="Active days"
          value={s.activeDays.toLocaleString('en-US')}
          hint="Days with a change, a finish or a diary entry"
        />
      </section>

      <section aria-labelledby="sections-heading">
        <h2 id="sections-heading" className="mb-3 text-lg font-semibold">
          By section
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.sections.map((sec) => {
            const ended = sec.completed + sec.retired + sec.dropped;
            return (
              <li key={sec.slug} className="rounded-xl border border-border bg-card p-4">
                <Link href={`/${sec.slug}`} className="font-semibold hover:underline">
                  {CATEGORIES[sec.slug].label}
                </Link>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {sec.metricValue.toLocaleString('en-US')}{' '}
                  <span className="text-sm font-semibold text-muted-foreground">
                    {sec.metricUnit} {sec.metricVerb}
                  </span>
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <Pair term="Tracked" value={sec.total} />
                  <Pair term={statusLabel('COMPLETED', sec.slug)} value={sec.completed} />
                  <Pair term={statusLabel('CONSUMING', sec.slug)} value={sec.ongoing} />
                  <Pair term={statusLabel('PLANNED', sec.slug)} value={sec.planned} />
                  <Pair term={statusLabel('DROPPED', sec.slug)} value={sec.dropped} />
                  <Pair term="Drop rate" value={ended ? `${Math.round((sec.dropped / ended) * 100)}%` : '—'} />
                  <Pair term="Avg score" value={<Score value={sec.avgRating} />} />
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Charts" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <FinishedPerMonthChart
            sections={data.perMonth.sections}
            months={data.perMonth.months}
            year={data.chartYear}
            years={data.years}
            yearHrefPrefix="/stats?year="
          />
        </div>
        <GenresChart genres={data.genres} />
        <ScoreByYearChart points={data.scoreByYear} />
        <StatusMixChart rows={data.statusMix} />
        <DropRateChart rows={data.dropRates} />
      </section>

      <CrowdOverviewPanel crowd={data.crowd} />
    </div>
  );
}

function StatTile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Pair({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{term}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

// ── Goals ───────────────────────────────────────────────────────────────────

async function Goals({ userId, prefs, year, currentYear: cy }: { userId: string; prefs: Prefs; year: number; currentYear: number }) {
  const goals = await getGoalsProgress(userId, year, prefs);
  const hidden = new Set<string>(prefs.hiddenSections);
  return (
    <GoalsClient
      year={year}
      years={[cy + 1, cy, cy - 1, cy - 2].filter((y, i, a) => a.indexOf(y) === i)}
      goals={goals}
      sections={NAV_ORDER.filter((s) => !hidden.has(s))}
    />
  );
}

// ── Taste ───────────────────────────────────────────────────────────────────

function Taste({ data, stored, prefs }: { data: TastePage; stored: StoredTasteProfile | null; prefs: Prefs }) {
  const drops = data.drops.filter((d) => dropPointPhrase(d) !== null);
  return (
    <div className="space-y-6">
      <TasteProfilePanel stored={stored} prefs={prefs} />

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Where you drop things</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The median point you were at when you dropped a title (from your history, else its current progress).
        </p>
        {drops.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {data.drops.length === 0
              ? 'No drops to measure yet (movies and games have no progress, so only books, TV, anime, manga and albums count).'
              : 'Your drops have no progress recorded, so there is no pattern yet.'}
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {drops.map((d) => (
              <li key={d.slug}>
                You usually drop {CATEGORIES[d.slug].label === 'TV Shows' ? 'TV' : CATEGORIES[d.slug].label.toLowerCase()}{' '}
                <span className="font-semibold">{dropPointPhrase(d)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {d.measured} of {d.dropped} {d.dropped === 1 ? 'drop' : 'drops'} measured
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <GenreDriftTable drift={data.drift} />

      <ComparePeriods compare={data.compare} />
    </div>
  );
}

/** The taste profile (7.2): built on Sundays, or now with Refresh. */
function TasteProfilePanel({ stored, prefs }: { stored: StoredTasteProfile | null; prefs: Prefs }) {
  // Sections hidden since the build drop out of the words and the favourites.
  const p = stored ? withoutHidden(stored.profile, prefs.hiddenSections) : null;
  const sentences = p ? tasteSentences(p, prefs.scoreFormat) : [];
  const top = p?.top ?? [];
  return (
    <section aria-labelledby="taste-profile-heading" className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="taste-profile-heading" className="font-semibold">
            Your taste profile
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {stored
              ? `Built ${stored.updatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: effectiveTimeZone(prefs) })} from ${stored.profile.finished} finished titles. Rebuilt every Sunday; the AI critic and recommendations read it.`
              : `Built every Sunday once you've finished ${MIN_FINISHED_FOR_PROFILE} titles, or now with Refresh.`}
          </p>
        </div>
        <TasteRefreshButton />
      </div>
      {!p ? (
        <p className="mt-3 text-sm text-muted-foreground">No taste profile yet.</p>
      ) : (
        <>
          {sentences.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {sentences.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Not much to say yet: rate and finish a few more titles.</p>
          )}
          {p.genres.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Genre weights</h3>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {p.genres.map((g) => (
                  <li key={g.genre} className="rounded-full border border-border px-2 py-0.5 text-xs">
                    {g.genre} <span className="tabular-nums text-muted-foreground">{g.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {top.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your S and A tiers</h3>
              <dl className="mt-1.5 space-y-1 text-sm">
                {top.map((t) => (
                  <div key={t.slug} className="flex gap-2">
                    <dt className="w-16 shrink-0 capitalize text-muted-foreground">{SECTION_NOUN[t.slug]}</dt>
                    <dd className="min-w-0">{t.titles.join(' · ')}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Genre drift (6.4): a genre × year table of your average scores. */
function GenreDriftTable({ drift }: { drift: TastePage['drift'] }) {
  const empty = drift.genres.length === 0 || drift.years.length === 0;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold">Genre drift</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Your average score per genre, by the year you finished the title.</p>
      {empty ? (
        <p className="mt-3 text-sm text-muted-foreground">Not enough finished titles with genres yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                  Genre
                </th>
                {drift.years.map((y) => (
                  <th key={y} scope="col" className="px-2 py-1.5 text-right font-medium tabular-nums">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drift.rows.map((r) => (
                <tr key={r.genre} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="max-w-[10rem] truncate py-1.5 pr-3 text-left font-normal">
                    {r.genre}
                  </th>
                  {r.scores.map((v, i) => (
                    <td key={i} className={cn('px-2 py-1.5 text-right tabular-nums', v == null && 'text-muted-foreground')}>
                      {v == null ? '—' : <Score value={v} />}
                      {v != null && <span className="ml-1 text-[10px] text-muted-foreground">({r.counts[i]})</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── People ──────────────────────────────────────────────────────────────────

function People({ data }: { data: Awaited<ReturnType<typeof getPeoplePage>> }) {
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        From the credits of the movies and TV shows you finished ({data.withCredits} with credits so far; details are
        fetched in the background). TV shows list their creators as directors.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PeopleTable title="Directors" rows={data.directors} />
        <PeopleTable title="Actors" rows={data.cast} />
      </div>
    </div>
  );
}

function PeopleTable({ title, rows }: { title: string; rows: PersonRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold">Most-watched {title.toLowerCase()}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No credits yet.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">
                {title.slice(0, -1)}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Titles
              </th>
              <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                Avg
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.name} className="border-b border-border/60 align-top last:border-0">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                  <span className="block font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.titles.join(' · ')}</span>
                </th>
                <td className="px-2 py-1.5 text-right tabular-nums">{p.count}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">
                  <Score value={p.avgScore} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
