import Link from 'next/link';
import {
  BookOpen,
  BookText,
  Boxes,
  CheckCircle2,
  Clapperboard,
  Disc3,
  Gamepad2,
  Layers,
  Library,
  Sparkles,
  Star,
  Tv,
  type LucideIcon,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CATEGORIES } from '@/lib/categories';
import { getDashboardStats, type CategoryStat } from '@/lib/data';
import { getCurrentUser } from '@/lib/session';
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

export default async function DashboardPage() {
  const [user, stats] = await Promise.all([
    getCurrentUser(),
    getDashboardStats(),
  ]);

  // Top-strip roll-ups across every domain.
  const totalItems = stats.reduce((sum, s) => sum + s.total, 0);
  const totalCompleted = stats.reduce((sum, s) => sum + s.completed, 0);
  const activeDomains = stats.filter((s) => s.total > 0).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back{user ? `, ${user.username}` : ''} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your hoard at a glance — across all seven domains.
        </p>
      </header>

      {/* Summary strip */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:mb-8 sm:grid-cols-3 sm:gap-4">
        <SummaryCard
          icon={Library}
          value={totalItems.toLocaleString()}
          label={totalItems === 1 ? 'item tracked' : 'items tracked'}
        />
        <SummaryCard
          icon={CheckCircle2}
          value={totalCompleted.toLocaleString()}
          label={totalCompleted === 1 ? 'item completed' : 'items completed'}
        />
        <SummaryCard
          icon={Layers}
          value={activeDomains.toLocaleString()}
          label={activeDomains === 1 ? 'active domain' : 'active domains'}
          sublabel={`of ${stats.length}`}
        />
      </div>

      {/* Per-category grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <CategoryCard key={stat.slug} stat={stat} />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  value,
  label,
  sublabel,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  sublabel?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4 sm:py-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold leading-none tabular-nums">
              {value}
            </span>
            {sublabel && (
              <span className="text-xs text-muted-foreground">{sublabel}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        </div>
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
          <CardTitle className="text-base font-semibold">
            {stat.label}
          </CardTitle>
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
              <span className="tabular-nums">
                {stat.metricValue.toLocaleString()}
              </span>{' '}
              <span className="text-lg font-semibold text-muted-foreground">
                {stat.metricUnit} {stat.metricVerb}
              </span>
            </p>
          )}

          {/* Status breakdown */}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {stat.ongoing}
              </span>{' '}
              ongoing
            </span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {stat.planned}
              </span>{' '}
              planned
            </span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {stat.completed}
              </span>{' '}
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
                <span className="font-semibold text-foreground tabular-nums">
                  {stat.avgRating.toFixed(1)}
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
