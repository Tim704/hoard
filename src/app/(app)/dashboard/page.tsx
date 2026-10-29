import {
  CategoryCard,
  ComingUpCard,
  FavouritesRow,
  GoalsCard,
  NowConsumingCard,
  OverviewCard,
} from '@/components/dashboard/tiles';
import { RecommendAcrossButton } from '@/components/recommend-across';
import type { CategorySlug } from '@/lib/categories';
import { getDashboardStats, getFavourites, getNowConsuming } from '@/lib/data';
import { favouritesShowcase } from '@/lib/favourites';
import { getCurrentPrefs } from '@/lib/data-prefs';
import { getComingUp } from '@/lib/data-tonight';
import { getCurrentGoals } from '@/lib/data-stats';
import { getCurrentUser } from '@/lib/session';

// 3×3 layout on desktop: the overview tile sits in the centre, "Now consuming"
// fills the last cell. Category order matches the sidebar.
const ROW_1_2_LEFT: CategorySlug[] = ['books', 'movies', 'anime', 'games'];
const ROW_2_RIGHT_3: CategorySlug[] = ['tv', 'manga', 'music'];

export default async function DashboardPage() {
  // `goals`: this year's goals (6.3) in the user's time zone; the tile hides without any.
  const [user, allStats, allConsuming, prefs, favourites, comingUp, { year: goalYear, goals }] = await Promise.all([
    getCurrentUser(),
    getDashboardStats(),
    getNowConsuming(),
    getCurrentPrefs(),
    getFavourites(),
    getComingUp(5),
    getCurrentGoals(),
  ]);

  // Sections hidden in Settings drop out of the tiles, the totals and "Now consuming".
  const hidden = new Set<string>(prefs.hiddenSections);
  const stats = allStats.filter((s) => !hidden.has(s.slug));
  const consuming = allConsuming.filter((a) => !hidden.has(a.category));
  const shown = (slugs: CategorySlug[]) => slugs.filter((s) => !hidden.has(s));
  const showcase = favouritesShowcase(favourites, prefs.hiddenSections);

  const bySlug = new Map(stats.map((s) => [s.slug, s]));
  const statFor = (slug: CategorySlug) => bySlug.get(slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Stacked below lg (the greeting would be cut short beside the button),
          one row that never wraps from lg. */}
      <header className="mb-6 flex flex-col items-start gap-3 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back{user ? `, ${user.username}` : ''} 👋
          </h1>
          <p className="mt-1 text-muted-foreground">
            {stats.length === allStats.length
              ? 'Your hoard at a glance — across all seven domains.'
              : 'Your hoard at a glance.'}
          </p>
        </div>
        <RecommendAcrossButton className="shrink-0" />
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
        <NowConsumingCard items={consuming} titleLanguage={prefs.titleLanguage} />
      </div>

      <ComingUpCard items={comingUp} />

      {goals.length > 0 && <GoalsCard year={goalYear} goals={goals} />}

      {showcase.length > 0 && (
        <FavouritesRow sections={showcase} titleLanguage={prefs.titleLanguage} />
      )}
    </div>
  );
}
