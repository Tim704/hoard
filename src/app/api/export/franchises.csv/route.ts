import { getExportFranchises } from '@/lib/data-export';
import { toFranchisesCsv } from '@/lib/export';
import { exportResponse } from '@/lib/export-response';

export const dynamic = 'force-dynamic';

/** Settings → Data: every franchise with its members (spec 1.11). */
export function GET() {
  return exportResponse('franchises', 'csv', async (userId) =>
    toFranchisesCsv(await getExportFranchises(userId)),
  );
}
