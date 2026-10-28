import { apiError, apiJson, apiRoute } from '@/lib/api-auth';
import { getApiActivity } from '@/lib/data-api';

export const dynamic = 'force-dynamic';

/** GET /api/v1/activity/:id — one of your titles, with its diary (docs/API.md). */
export function GET(req: Request, { params }: { params: { id: string } }) {
  return apiRoute(req, async (userId) => {
    const id = params.id;
    if (!id || id.length > 100) return apiError(404, 'not_found', 'No such title in your library.');
    const activity = await getApiActivity(userId, id);
    if (!activity) return apiError(404, 'not_found', 'No such title in your library.');
    return apiJson({ activity });
  });
}
