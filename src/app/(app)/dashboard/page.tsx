import { CustomizeDashboard } from '@/components/dashboard/customize-dashboard';
import {
  CategoryCard,
  ComingUpCard,
  FavouritesRow,
  GoalsCard,
  NowConsumingCard,
  OverviewCard,
  TILE_GAP,
} from '@/components/dashboard/tiles';
import { WelcomeCard } from '@/components/dashboard/welcome-card';
import { RecommendAcrossButton } from '@/components/recommend-across';
import { getDashboardStats, getFavourites, getNowConsuming } from '@/lib/data';
import { getCurrentPrefs } from '@/lib/data-prefs';
import { getCurrentGoals } from '@/lib/data-stats';
import { getComingUp } from '@/lib/data-tonight';
import type { TileId } from '@/lib/dashboard-tile-ids';
import { dataNeeds, isDefaultOrder, resolveTiles, tileSection } from '@/lib/dashboard-tiles';
import { favouritesShowcase } from '@/lib/favourites';
import { getCurrentUser } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * The dashboard: the tiles the user picked (Customize, or Settings → Themes),
 * in their order (src/lib/dashboard-tiles.ts). Only the shown tiles' data is
 * loaded. Recommend across media is the header's button, not a tile.
 */
export default async function DashboardPage() {
  const [user, prefs] = await Promise.all([getCurrentUser(), getCurrentPrefs()]);
  const tiles = resolveTiles(prefs.dashboard, prefs.hiddenSections);
  const needs = dataNeeds(tiles);
  const [allStats, allConsuming, favourites, comingUp, goals] = await Promise.all([
    needs.stats ? getDashboardStats() : null,
    needs.nowConsuming ? getNowConsuming(prefs.hiddenSections) : null,
    needs.favourites ? getFavourites() : null,
    needs.comingUp ? getComingUp(5) : null,
    // This year's goals (6.3) in the user's time zone; the tile hides without any.
    needs.goals ? getCurrentGoals() : null,
  ]);

  // Sections hidden in Settings drop out of the tiles, the totals and "Now consuming".
  const hidden = new Set<string>(prefs.hiddenSections);
  const stats = allStats?.filter((s) => !hidden.has(s.slug)) ?? null;
  const bySlug = new Map(stats?.map((s) => [s.slug, s]));
  const defaultOrder = isDefaultOrder(prefs.dashboard.order);

  function tile(id: TileId): React.ReactNode {
    switch (id) {
      case 'recommend':
        return null;
      case 'overview':
        return stats && <OverviewCard key={id} stats={stats} defaultOrder={defaultOrder} />;
      case 'now-consuming':
        return (
          allConsuming && (
            <NowConsumingCard
              key={id}
              items={allConsuming.items}
              total={allConsuming.total}
              titleLanguage={prefs.titleLanguage}
              defaultOrder={defaultOrder}
            />
          )
        );
      case 'coming-up':
        return comingUp && <ComingUpCard key={id} items={comingUp} defaultOrder={defaultOrder} />;
      case 'goals':
        return goals && goals.goals.length > 0 && <GoalsCard key={id} year={goals.year} goals={goals.goals} />;
      case 'favourites': {
        const showcase = favourites ? favouritesShowcase(favourites, prefs.hiddenSections) : [];
        return showcase.length > 0 && <FavouritesRow key={id} sections={showcase} titleLanguage={prefs.titleLanguage} />;
      }
      default: {
        const slug = tileSection(id);
        const stat = slug && bySlug.get(slug);
        return stat && <CategoryCard key={id} stat={stat} />;
      }
    }
  }
  const shown = tiles.map(tile).filter(Boolean);
  // A brand-new account: a welcome with the two ways in, before the (empty) tiles.
  const fresh = allStats != null && allStats.every((s) => s.total === 0);

  return (
    <div className="mx-auto max-w-6xl px-[var(--page-pad)] py-6 sm:py-10">
      {/* From sm, one line that never wraps: the greeting truncates beside the
          buttons (icons where a label wouldn't leave it room, see HeaderButton).
          On phones the greeting has the full width and the labelled buttons
          sit under it. */}
      <header data-dashboard-header="" className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight sm:truncate sm:text-3xl">
            {fresh ? 'Welcome' : 'Welcome back'}
            {user ? `, ${user.username}` : ''} 👋
          </h1>
          <p className="mt-1 hidden text-muted-foreground sm:block">
            {allStats && stats?.length === allStats.length
              ? 'Your hoard at a glance — across all seven sections.'
              : 'Your hoard at a glance.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tiles.includes('recommend') && <RecommendAcrossButton header />}
          <CustomizeDashboard saved={prefs.dashboard} />
        </div>
      </header>

      {fresh && <WelcomeCard />}

      {shown.length > 0 ? (
        // One grid for every tile, in the user's order: the section tiles, the
        // overview and Now consuming take a cell; Coming up, Goals and
        // Favourites span the row. 3 columns on desktop, 2 from phones up (on
        // phones the overview and Now consuming span both).
        <div data-dashboard-tiles="" className={cn('grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3', TILE_GAP)}>
          {shown}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-muted-foreground">Your dashboard is empty.</p>
          <CustomizeDashboard saved={prefs.dashboard} empty />
        </div>
      )}
    </div>
  );
}
