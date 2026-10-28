import { apiJson, apiRoute } from '@/lib/api-auth';
import { getStatsOverview } from '@/lib/data-stats';

export const dynamic = 'force-dynamic';

/** GET /api/v1/stats — the /stats Overview numbers (docs/API.md). */
export function GET(req: Request) {
  return apiRoute(req, async (userId) => {
    const o = await getStatsOverview(userId, null);
    return apiJson({
      today: o.today,
      sections: o.sections,
      statusMix: o.statusMix,
      dropRates: o.dropRates,
      streaks: o.streaks,
      year: o.chartYear,
      finishedPerMonth: o.perMonth,
      topGenres: o.genres,
      scoreByYear: o.scoreByYear,
    });
  });
}
