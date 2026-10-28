import Image from 'next/image';
import Link from 'next/link';
import {
  BookOpen,
  BookText,
  Boxes,
  CheckCircle2,
  Clapperboard,
  Disc3,
  Gamepad2,
  ImageOff,
  Layers,
  Library,
  Play,
  Sparkles,
  Star,
  Tv,
  type LucideIcon,
} from 'lucide-react';

import { Score } from '@/components/prefs-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import { getDashboardStats, getNowConsuming, type CategoryStat } from '@/lib/data';
import { getCurrentPrefs } from '@/lib/data-prefs';
import { getCurrentUser } from '@/lib/session';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

// Resolve category icon-name strings to lucide components (kept in step with the
// sidebar's mapping).
const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Clapperboard,
  Tv,
  Sparkles,
  BookText,
  Gamepad2,
  Disc3,
};

// 3×3 layout on desktop: the overview tile sits in the centre, "Now consuming"
// fills the last cell. Category order matches the sidebar.
const ROW_1_2_LEFT: CategorySlug[] = ['books', 'movies', 'anime', 'games'];
const ROW_2_RIGHT_3: CategorySlug[] = ['tv', 'manga', 'music'];

export default async function DashboardPage() {
  const [user, allStats, allConsuming, prefs] = await Promise.all([
    getCurrentUser(),
    getDashboardStats(),
    getNowConsuming(),
    getCurrentPrefs(),
  ]);

  // Sections hidden in Settings drop out of the tiles, the totals and "Now consuming".
  const hidden = new Set<string>(prefs.hiddenSections);
  const stats = allStats.filter((s) => !hidden.has(s.slug));
  const consuming = allConsuming.filter((a) => !hidden.has(a.category));
  const shown = (slugs: CategorySlug[]) => slugs.filter((s) => !hidden.has(s));

  const bySlug = new Map(stats.map((s) => [s.slug, s]));
  const statFor = (slug: CategorySlug) => bySlug.get(slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back{user ? `, ${user.username}` : ''} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">
          {stats.length === allStats.length
            ? 'Your hoard at a glance — across all seven domains.'
            : 'Your hoard at a glance.'}
        </p>
      </header>

      {/* 3×3 on desktop. At sm (2 columns) the overview spans the full width and
          moves first, leaving 8 tiles in 4 even rows. Phones: one column. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown(ROW_1_2_LEFT).map((slug) => {
          const stat = statFor(slug);
          return stat ? <CategoryCard key={slug} stat={stat} /> : null;
        })}
        <OverviewCard stats={stats} />
        {shown(ROW_2_RIGHT_3).map((slug) => {
          const stat = statFor(slug);
          return stat ? <CategoryCard key={slug} stat={stat} /> : null;
        })}
        <NowConsumingCard items={consuming} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function OverviewCard({ stats }: { stats: CategoryStat[] }) {
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
    { icon: Star, value: <Score value={avg} />, label: 'avg rating' },
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

function NowConsumingCard({ items }: { items: ActivityWithMedia[] }) {
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
                title={`${a.media.title} · ${CATEGORIES[a.category].singular}`}
                className="relative aspect-[2/3] w-[18%] shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border transition hover:ring-primary/60"
              >
                {a.media.imageUrl ? (
                  <Image
                    src={a.media.imageUrl}
                    alt={a.media.title}
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

function CategoryCard({ stat }: { stat: CategoryStat }) {
  const config = CATEGORIES[stat.slug];
  const Icon = ICONS[config.icon] ?? Boxes;
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
        <CardContent>
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

          {/* Status breakdown */}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold tabular-nums text-foreground">{stat.ongoing}</span>{' '}
              ongoing
            </span>
            <span>
              <span className="font-semibold tabular-nums text-foreground">{stat.planned}</span>{' '}
              planned
            </span>
            <span>
              <span className="font-semibold tabular-nums text-foreground">{stat.completed}</span>{' '}
              done
            </span>
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
                  <Score value={stat.avgRating} />
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
