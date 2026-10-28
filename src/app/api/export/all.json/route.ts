import { getFullExport } from '@/lib/data-export';
import { exportResponse } from '@/lib/export-response';

export const dynamic = 'force-dynamic';

/** Settings → Data: everything the user owns, as JSON (spec 1.11). */
export function GET() {
  return exportResponse('all', 'json', async (userId) =>
    JSON.stringify(await getFullExport(userId), null, 2),
  );
}
