// ───────────────────────────────────────────────────────────────────────────
//  Migration step "003-diary-from-finished" (spec 3.1): one diary entry for
//  every Completed or Retired activity that has a `finishedAt` and no entry
//  yet, dated `finishedAt` in the server's TZ — skipping titles added as done
//  (finishedAt within 2 minutes of createdAt: no real watch date). Idempotent:
//  it only reads activities without an entry. Batched by id, so skipped rows
//  never stall the walk.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { DIARY_STATUSES, planDiaryBackfill, type BackfillCandidate } from '@/lib/diary';
import { serverTimeZone } from '@/lib/prefs';
import type { Status } from '@/lib/status';

const BATCH = 500;

export async function backfillDiary(): Promise<number> {
  const timeZone = serverTimeZone();
  let written = 0;
  let after: string | null = null;
  for (;;) {
    const rows: BackfillCandidate[] & { id: string }[] = await prisma.userMediaActivity.findMany({
      where: {
        status: { in: DIARY_STATUSES as Status[] },
        finishedAt: { not: null },
        diaryEntries: { none: {} },
        ...(after ? { id: { gt: after } } : {}),
      },
      select: { id: true, userId: true, status: true, finishedAt: true, createdAt: true, rating: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    if (!rows.length) break;
    after = rows[rows.length - 1].id;
    const data = planDiaryBackfill(rows, new Set(), timeZone);
    if (data.length) {
      await prisma.diaryEntry.createMany({ data });
      written += data.length;
    }
    if (rows.length < BATCH) break;
  }
  if (written) console.log(`[hoard] diary backfill: ${written} entries`);
  return written;
}
