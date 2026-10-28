import { getExportActivities } from '@/lib/data-export';
import { toLibraryCsv } from '@/lib/export';
import { exportResponse } from '@/lib/export-response';

export const dynamic = 'force-dynamic';

/** Settings → Data: the whole library, one row per title (spec 1.11). */
export function GET() {
  return exportResponse('library', 'csv', async (userId, timeZone) =>
    toLibraryCsv(await getExportActivities(userId), timeZone),
  );
}
