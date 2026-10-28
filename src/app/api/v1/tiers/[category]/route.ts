import { apiError, apiJson, apiRoute } from '@/lib/api-auth';
import { apiTiers } from '@/lib/api-shape';
import { isCategorySlug } from '@/lib/categories';
import { loadCategoryFor } from '@/lib/data';
import { buildTierBoard } from '@/lib/tiers';

export const dynamic = 'force-dynamic';

/** GET /api/v1/tiers/:category — the section's tier list (docs/API.md). */
export function GET(req: Request, { params }: { params: { category: string } }) {
  return apiRoute(req, async (userId) => {
    const slug = params.category;
    if (!isCategorySlug(slug)) return apiError(404, 'not_found', 'Unknown category.');
    return apiJson(apiTiers(slug, buildTierBoard(await loadCategoryFor(userId, slug))));
  });
}
