import Link from 'next/link';

import { Score } from '@/components/prefs-provider';
import { CATEGORIES } from '@/lib/categories';
import type { TastePage } from '@/lib/data-stats';
import { HOURS_NOTE } from '@/lib/stats/measures';
import type { PeriodSummary } from '@/lib/stats/compare';
import { cn } from '@/lib/utils';

const PRESETS = [
  { key: 'year', label: 'This year vs last year' },
  { key: 'quarter', label: 'Last 3 months vs the 3 before' },
  { key: 'custom', label: 'Custom' },
] as const;

/**
 * Compare periods (spec 6.5): two ranges side by side. Presets are links; a
 * custom pair of ranges is a plain GET form, so every comparison has a URL.
 */
export function ComparePeriods({ compare }: { compare: TastePage['compare'] }) {
  const { a, b } = compare.ranges;
  const sections = compare.a.perSection
    .map((s, i) => ({ slug: s.slug, a: s.finished, b: compare.b.perSection[i]?.finished ?? 0 }))
    .filter((s) => s.a > 0 || s.b > 0);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold">Compare periods</h2>
      <nav aria-label="Periods" className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Link
            key={p.key}
            href={
              p.key === 'custom'
                ? `/stats?tab=taste&preset=custom&a1=${a.from}&a2=${a.to}&b1=${b.from}&b2=${b.to}#compare`
                : `/stats?tab=taste&preset=${p.key}#compare`
            }
            aria-current={compare.preset === p.key ? 'true' : undefined}
            className={cn(
              'rounded-md border px-2.5 py-1 text-sm transition-colors',
              compare.preset === p.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      {compare.preset === 'custom' && (
        <form id="compare" method="get" action="/stats" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="tab" value="taste" />
          <input type="hidden" name="preset" value="custom" />
          <RangeFields legend="Period A" from={['a1', a.from]} to={['a2', a.to]} />
          <RangeFields legend="Period B" from={['b1', b.from]} to={['b2', b.to]} />
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="h-9 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              Compare
            </button>
          </div>
        </form>
      )}

      <div id={compare.preset === 'custom' ? undefined : 'compare'} className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                <span className="sr-only">Measure</span>
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {a.label}
              </th>
              <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                {b.label}
              </th>
            </tr>
          </thead>
          <tbody>
            <Row label="Titles finished" a={compare.a.finished} b={compare.b.finished} strong />
            {sections.map((s) => (
              <Row key={s.slug} label={CATEGORIES[s.slug].label} a={s.a} b={s.b} indent />
            ))}
            <Row label="Average score" a={<Score value={compare.a.avgScore} />} b={<Score value={compare.b.avgScore} />} />
            <Row label="Hours watched" a={compare.a.hours.toLocaleString('en-US')} b={compare.b.hours.toLocaleString('en-US')} />
            <Row label="Top genres" a={<Genres p={compare.a} />} b={<Genres p={compare.b} />} />
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {a.from} – {a.to} vs {b.from} – {b.to}. Finished = a diary entry in the period. {HOURS_NOTE}
      </p>
    </section>
  );
}

function RangeFields({ legend, from, to }: { legend: string; from: [string, string]; to: [string, string] }) {
  return (
    <fieldset className="min-w-0 rounded-md border border-border p-3">
      <legend className="px-1 text-xs text-muted-foreground">{legend}</legend>
      <div className="flex items-center gap-2">
        <input type="date" name={from[0]} defaultValue={from[1]} required aria-label={`${legend} from`} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base sm:flex-none sm:text-sm" />
        <span className="shrink-0 text-xs text-muted-foreground">to</span>
        <input type="date" name={to[0]} defaultValue={to[1]} required aria-label={`${legend} to`} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base sm:flex-none sm:text-sm" />
      </div>
    </fieldset>
  );
}

function Row({ label, a, b, strong, indent }: { label: string; a: React.ReactNode; b: React.ReactNode; strong?: boolean; indent?: boolean }) {
  return (
    <tr className="border-b border-border/60 align-top last:border-0">
      <th scope="row" className={cn('py-1.5 pr-3 text-left font-normal', indent && 'pl-3 text-muted-foreground', strong && 'font-semibold')}>
        {label}
      </th>
      <td className={cn('px-2 py-1.5 text-right tabular-nums', strong && 'font-semibold')}>{a}</td>
      <td className={cn('py-1.5 pl-2 text-right tabular-nums', strong && 'font-semibold')}>{b}</td>
    </tr>
  );
}

function Genres({ p }: { p: PeriodSummary }) {
  if (p.topGenres.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-block max-w-[10rem] text-xs sm:max-w-none">
      {p.topGenres.slice(0, 3).map((g) => `${g.genre} (${g.count})`).join(', ')}
    </span>
  );
}
