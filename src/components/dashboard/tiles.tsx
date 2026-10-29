// ───────────────────────────────────────────────────────────────────────────
//  The dashboard's tiles (src/lib/dashboard-tiles.ts has the registry: which
//  show, in what order). Server components; the page loads their data.
// ───────────────────────────────────────────────────────────────────────────

import Image from 'next/image';
import Link from 'next/link';
import {
  Boxes,
  CalendarClock,
  CheckCircle2,
  Heart,
  ImageOff,
  Layers,
  Library,
  Play,
  Star,
  Target,
  type LucideIcon,
} from 'lucide-react';

import { iconFor } from '@/components/icons';
import { Score } from '@/components/prefs-provider';
import { StatusIcon } from '@/components/status-icon';
import { GoalBar } from '@/components/stats/goals-client';
import { TitleLink } from '@/components/title/title-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CATEGORIES } from '@/lib/categories';
import type { CategoryStat } from '@/lib/data';
import type { TitleLanguage } from '@/lib/display-prefs';
import type { ShowcaseSection } from '@/lib/favourites';
import type { ComingUpItem } from '@/lib/data-tonight';
import { formatYmd } from '@/lib/release';
import type { Status } from '@/lib/status';
import type { GoalProgress } from '@/lib/stats/goals';
import { isTierEligible } from '@/lib/tiers';
import { displayTitle } from '@/lib/title';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

/** This year's goals (6.3) with their progress bars. */
export function GoalsCard({ year, goals }: { year: number; goals: GoalProgress[] }) {
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold">
          <Link href={`/stats?tab=goals&year=${year}`} className="hover:underline">
            Goals for {year}
          </Link>
        </CardTitle>
        <Target className="h-5 w-5 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {goals.map((g) => (
            <li key={g.id}>
              <GoalBar goal={g} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** "Coming up" (5.9): the next five Planned releases with a known day. */
export function ComingUpCard({ items }: { items: ComingUpItem[] }) {
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold">Coming up</CardTitle>
        <CalendarClock className="h-5 w-5 text-sky-500" aria-hidden />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No announced release dates among your planned titles.
          </p>
        ) : (
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <TitleLink
                  slug={item.slug}
                  id={item.id}
                  className="flex items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-muted/60 lg:flex-col lg:items-start"
                >
                  <span className="relative block aspect-[2/3] w-10 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border lg:w-16">
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.title} fill sizes="64px" className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {CATEGORIES[item.slug].singular} · {formatYmd(item.releaseDate)}
                    </span>
                    <span className="block text-xs font-medium text-sky-700 dark:text-sky-300">
                      in {item.days} day{item.days === 1 ? '' : 's'}
                    </span>
                  </span>
                </TitleLink>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewCard({ stats }: { stats: CategoryStat[] }) {
  const totalItems = stats.reduce((sum, s) => sum + s.total, 0);
  const totalCompleted = stats.reduce((sum, s) => sum + s.completed, 0);
  const activeDomains = stats.filter((s) => s.total > 0).length;
  const rated = stats.filter((s) => s.avgRating != null);
  const avg =
    rated.length === 0
      ? null
      : rated.reduce((sum, s) => sum + (s.avgRating ?? 0), 0) / rated.length;

  const cells: { icon: LucideIcon; value: React.ReactNode; label: string }[] = [
    { icon: Library, value: totalItems.toLocaleString(), label: 'tracked' },
    { icon: CheckCircle2, value: totalCompleted.toLocaleString(), label: 'completed' },
    { icon: Layers, value: `${activeDomains}/${stats.length}`, label: 'domains' },
    { icon: Star, value: <Score value={avg} star={false} />, label: 'avg rating' },
  ];

  return (
    <Card className="h-full border-primary/30 bg-gradient-to-br from-muted/60 to-card sm:order-first sm:col-span-2 lg:order-none lg:col-span-1">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold">Your hoard</CardTitle>
        <Boxes className="h-5 w-5 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-2">
          {cells.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function NowConsumingCard({
  items,
  titleLanguage,
}: {
  items: ActivityWithMedia[];
  titleLanguage: TitleLanguage;
}) {
  const shown = items.slice(0, 5);
  const extra = items.length - shown.length;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold">Now consuming</CardTitle>
        <Play className="h-5 w-5 fill-emerald-500/30 text-emerald-500" />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing in progress. Start something from your backlog.
          </p>
        ) : (
          <div className="flex items-start gap-2">
            {shown.map((a) => (
              <Link
                key={a.id}
                href={`/${a.category}`}
                title={`${displayTitle(a.media, titleLanguage)} · ${CATEGORIES[a.category].singular}`}
                className="relative aspect-[2/3] w-[18%] shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border transition hover:ring-primary/60"
              >
                {a.media.imageUrl ? (
                  <Image
                    src={a.media.imageUrl}
                    alt={displayTitle(a.media, titleLanguage)}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </Link>
            ))}
            {extra > 0 && (
              <span className="self-center text-xs font-medium text-muted-foreground">
                +{extra}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * "Favourites" (spec 1.10): each visible section's first four starred titles,
 * in tier list order. Only rendered when there is at least one favourite.
 */
export function FavouritesRow({
  sections,
  titleLanguage,
}: {
  sections: ShowcaseSection[];
  titleLanguage: TitleLanguage;
}) {
  return (
    <section className="mt-6 sm:mt-8" aria-labelledby="favourites-heading">
      <h2 id="favourites-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Heart className="h-5 w-5 fill-rose-500/30 text-rose-500" aria-hidden />
        Favourites
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ slug, items }) => (
          <Card key={slug}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                <Link href={`/${slug}`} className="hover:underline">
                  {CATEGORIES[slug].label}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid grid-cols-4 gap-2">
                {items.map((a) => {
                  const title = displayTitle(a.media, titleLanguage);
                  return (
                    <li key={a.id} className="min-w-0">
                      <Link
                        href={`/${slug}`}
                        title={title}
                        className="relative block aspect-[2/3] overflow-hidden rounded-md bg-muted ring-1 ring-border transition hover:ring-primary/60"
                      >
                        {a.media.imageUrl ? (
                          <Image src={a.media.imageUrl} alt={title} fill sizes="80px" className="object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center overflow-hidden p-1 text-center text-[10px] leading-tight text-muted-foreground [overflow-wrap:anywhere]">
                            {title}
                          </span>
                        )}
                        {a.tier && isTierEligible(a.status) && (
                          <span className="absolute left-1 top-1 rounded bg-background/85 px-1 text-[10px] font-bold">
                            {a.tier}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** A section tile's status line: each entry's status (its icon), count and word. */
const STATUS_LINE = [
  { status: 'CONSUMING', count: 'ongoing', word: 'ongoing' },
  { status: 'PLANNED', count: 'planned', word: 'planned' },
  { status: 'COMPLETED', count: 'completed', word: 'done' },
] as const satisfies readonly { status: Status; count: keyof CategoryStat; word: string }[];

export function CategoryCard({ stat }: { stat: CategoryStat }) {
  const config = CATEGORIES[stat.slug];
  const Icon = iconFor(config.icon);
  const empty = stat.total === 0;

  return (
    <Link
      href={`/${stat.slug}`}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full transition-colors group-hover:border-primary/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base font-semibold">{stat.label}</CardTitle>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="[container-type:inline-size]">
          {/* BIG headline metric */}
          {empty ? (
            <p className="text-2xl font-bold tracking-tight text-muted-foreground">
              Nothing yet
            </p>
          ) : (
            <p className="text-2xl font-bold tracking-tight">
              <span className="tabular-nums">{stat.metricValue.toLocaleString()}</span>{' '}
              <span className="text-lg font-semibold text-muted-foreground">
                {stat.metricUnit} {stat.metricVerb}
              </span>
            </p>
          )}

          {/* Status breakdown: one line. In a narrow card the words give way
              to the status icons (screen readers still hear the words); a
              count too long even for that cuts the last entry short. */}
          <div className="mt-3 flex flex-nowrap items-center gap-x-3 text-sm text-muted-foreground">
            {STATUS_LINE.map(({ status, count, word }, i) => (
              <span key={status} className={i === STATUS_LINE.length - 1 ? 'min-w-0 truncate' : 'shrink-0'}>
                <StatusIcon
                  status={status}
                  decorative
                  className="mr-1 hidden h-3.5 w-3.5 align-[-2px] [@container(max-width:14rem)]:inline-block"
                />
                <span className="font-semibold tabular-nums text-foreground">{stat[count]}</span>
                <span className="[@container(max-width:14rem)]:sr-only">{' '}{word}</span>
              </span>
            ))}
          </div>

          {/* Avg rating */}
          <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
            <Star
              className={cn(
                'h-4 w-4',
                stat.avgRating != null
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-muted-foreground/50',
              )}
            />
            {stat.avgRating != null ? (
              <span>
                <span className="font-semibold tabular-nums text-foreground">
                  <Score value={stat.avgRating} star={false} />
                </span>{' '}
                avg rating
              </span>
            ) : (
              <span>No ratings yet</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
