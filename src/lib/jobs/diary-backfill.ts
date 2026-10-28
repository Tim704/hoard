// ───────────────────────────────────────────────────────────────────────────
//  Migration step "003-diary-from-finished" (spec 3.1): one diary entry for
//  every Completed or Retired activity that has a `finishedAt` and no entry
//  yet, dated `finishedAt` in the server's TZ. Idempotent: it only reads
//  activities without an entry, so a second run finds nothing. Batched.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { DIARY_STATUSES, planDiaryBackfill } from '@/lib/diary';
import { serverTimeZone } from '@/lib/prefs';
import type { Status } from '@/lib/status';

const BATCH = 500;

export async function backfillDiary(): Promise<number> {
  const timeZone = serverTimeZone();
  let written = 0;
  for (;;) {
    const rows = await prisma.userMediaActivity.findMany({
      where: {
        status: { in: DIARY_STATUSES as Status[] },
        finishedAt: { not: null },
        diaryEntries: { none: {} },
      },
      select: { id: true, userId: true, status: true, finishedAt: true, rating: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    if (!rows.length) break;
    const data = planDiaryBackfill(rows, new Set(), timeZone);
    if (!data.length) break; // nothing writable: never loop on the same rows
    await prisma.diaryEntry.createMany({ data });
    written += data.length;
    if (rows.length < BATCH) break;
  }
  if (written) console.log(`[hoard] diary backfill: ${written} entries`);
  return written;
}
