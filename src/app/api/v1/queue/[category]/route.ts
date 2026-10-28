import { apiError, apiJson, apiRoute } from '@/lib/api-auth';
import { apiQueue } from '@/lib/api-shape';
import { isCategorySlug } from '@/lib/categories';
import { loadCategoryFor } from '@/lib/data';
import { orderQueue } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/** GET /api/v1/queue/:category — the section's Up next, in order (docs/API.md). */
export function GET(req: Request, { params }: { params: { category: string } }) {
  return apiRoute(req, async (userId) => {
    const slug = params.category;
    if (!isCategorySlug(slug)) return apiError(404, 'not_found', 'Unknown category.');
    return apiJson(apiQueue(slug, orderQueue(await loadCategoryFor(userId, slug))));
  });
}
