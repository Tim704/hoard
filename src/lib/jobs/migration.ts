// ───────────────────────────────────────────────────────────────────────────
//  The `migration` job (spec G1 / G9): data backfills that need columns added
//  by `prisma db push`, so they can't live in prisma/sql/ (which runs BEFORE
//  db push). The job runs at every startup, but each step runs ONCE: a clean
//  run is recorded (src/lib/jobs/migration-store.ts) and skipped from then on,
//  so a backfill never recreates rows a user deleted later. A failed step is
//  not recorded and is retried at the next startup, so steps must still be
//  IDEMPOTENT (only touch rows that still need it).
//
//  Later tasks append their steps to MIGRATION_STEPS (in order). A failing
//  step is logged and the rest still run; the job then reports the failures
//  so Settings → System shows them.
// ───────────────────────────────────────────────────────────────────────────

import { backfillDiary } from '@/lib/jobs/diary-backfill';
import { prismaMigrationStore, type MigrationStore } from '@/lib/jobs/migration-store';
import { prisma } from '@/lib/prisma';
import { serverTimeZone } from '@/lib/prefs';
import { todayYmd } from '@/lib/release';

export interface MigrationStep {
  /** Stable, unique id, e.g. "003-diary-from-finished". */
  id: string;
  run: () => Promise<void>;
}

export const MIGRATION_STEPS: MigrationStep[] = [
  // Later tasks append steps here.
  { id: '003-diary-from-finished', run: async () => void (await backfillDiary()) },
  // 3.3: shows fetched before seasons were stored get them on the next
  // metadata run. Only rows TMDB says have seasons and that have none stored.
  {
    id: '010-tv-seasons-refetch',
    run: async () =>
      void (await prisma.tvShow.updateMany({
        where: {
          metaFetchedAt: { not: null },
          seasonCount: { gt: 0 },
          seasons: { none: {} },
          NOT: [{ externalId: { startsWith: 'manual:' } }, { externalId: { startsWith: 'demo-' } }],
        },
        data: { metaFetchedAt: null },
      })),
  },
  // 5.5: shows finished before seasons were recorded have seen every season
  // aired so far (the highest aired season number, by the server's today), or
  // their seasonCount when no seasons are stored — so the first "New season"
  // is a real one. Only unset rows.
  {
    id: '014-seen-season-count',
    run: async () => {
      const today = todayYmd(serverTimeZone());
      await prisma.$executeRaw`
        UPDATE "UserMediaActivity" a SET "seenSeasonCount" =
          CASE WHEN EXISTS (SELECT 1 FROM "TvSeason" s WHERE s."tvShowId" = t.id)
            THEN COALESCE((SELECT MAX(s."seasonNumber") FROM "TvSeason" s
                           WHERE s."tvShowId" = t.id AND s."airDate" <= ${today}), 0)
            ELSE t."seasonCount" END
        FROM "TVShow" t
        WHERE a."tvShowId" = t.id AND a.status = 'COMPLETED' AND a."seenSeasonCount" IS NULL
          AND (t."seasonCount" IS NOT NULL OR EXISTS (SELECT 1 FROM "TvSeason" s WHERE s."tvShowId" = t.id))`;
    },
  },
];

/**
 * Run every step that hasn't finished before, in order, recording each clean
 * run. Throws a summary if any step failed (those are retried next startup).
 */
export async function runMigrations(
  steps: readonly MigrationStep[] = MIGRATION_STEPS,
  store: MigrationStore = prismaMigrationStore,
): Promise<void> {
  const failed: string[] = [];
  for (const step of steps) {
    try {
      if (await store.isDone(step.id)) continue;
      const started = Date.now();
      await step.run();
      await store.markDone(step.id, Date.now() - started);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[hoard] migration step ${step.id} failed:`, message);
      failed.push(`${step.id}: ${message}`);
    }
  }
  if (failed.length) throw new Error(`Migration steps failed: ${failed.join('; ')}`);
}
