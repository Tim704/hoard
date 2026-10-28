import { apiError, apiJson, apiRoute } from '@/lib/api-auth';
import { decodeCursor, parseLimit } from '@/lib/api-tokens';
import { isCategorySlug } from '@/lib/categories';
import { getApiLibraryPage } from '@/lib/data-api';
import { isStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

/** GET /api/v1/library?category=&status=&limit=&cursor= (docs/API.md). */
export function GET(req: Request) {
  return apiRoute(req, async (userId) => {
    const params = new URL(req.url).searchParams;
    const category = params.get('category') || null;
    const status = params.get('status')?.toUpperCase() || null;
    const limit = parseLimit(params.get('limit'));
    const rawCursor = params.get('cursor');
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    if (category && !isCategorySlug(category)) {
      return apiError(400, 'bad_request', 'Unknown category. Use books, movies, tv, anime, manga, games or music.');
    }
    if (status && !isStatus(status)) {
      return apiError(400, 'bad_request', 'Unknown status. Use PLANNED, CONSUMING, COMPLETED, ON_HOLD, RETIRED or DROPPED.');
    }
    if (limit == null) return apiError(400, 'bad_request', 'limit must be a whole number from 1 to 100.');
    if (rawCursor && !cursor) return apiError(400, 'bad_request', 'That cursor is not valid. Start again without one.');
    const page = await getApiLibraryPage(userId, {
      category: category && isCategorySlug(category) ? category : null,
      status: status && isStatus(status) ? status : null,
      limit,
      cursor,
    });
    return apiJson(page);
  });
}
