import { CalendarRange } from 'lucide-react';

import { AnimeSeasonClient } from '@/components/anime-season-client';
import { currentSeason } from '@/lib/anime-season';
import { getPrefs } from '@/lib/data-prefs';
import { effectiveTimeZone } from '@/lib/prefs';
import { todayYmd } from '@/lib/release';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Anime season · Hoard' };
export const dynamic = 'force-dynamic';

/** The anime season browser (5.11): a season's anime, most popular first, each with an add row. */
export default async function AnimeSeasonPage() {
  const user = await requireUser();
  const today = todayYmd(effectiveTimeZone(await getPrefs(user.id)));
  const initial = currentSeason(today);
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarRange className="h-6 w-6 text-rose-500" aria-hidden />
          Anime season
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything airing in a season, most popular first, from AniList.
        </p>
      </header>
      <AnimeSeasonClient initialSeason={initial.season} initialYear={initial.year} maxYear={initial.year + 1} />
    </div>
  );
}
