// ───────────────────────────────────────────────────────────────────────────
//  The `migration` job (spec G1 / G9): data backfills that need columns added
//  by `prisma db push`, so they can't live in prisma/sql/ (which runs BEFORE
//  db push). Runs once at every startup, so EVERY STEP MUST BE IDEMPOTENT:
//  it should only touch rows that still need it and be cheap when none do.
//
//  Later tasks append their steps to MIGRATION_STEPS (in order). A failing
//  step is logged and the rest still run; the job then reports the failures
//  so Settings → System shows them.
// ───────────────────────────────────────────────────────────────────────────

import { backfillDiary } from '@/lib/jobs/diary-backfill';

export interface MigrationStep {
  /** Stable, unique id, e.g. "003-diary-from-finished". */
  id: string;
  run: () => Promise<void>;
}

export const MIGRATION_STEPS: MigrationStep[] = [
  // Later tasks append steps here.
  { id: '003-diary-from-finished', run: async () => void (await backfillDiary()) },
];

/** Run every step in order. Throws a summary if any step failed. */
export async function runMigrations(steps: readonly MigrationStep[] = MIGRATION_STEPS): Promise<void> {
  const failed: string[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[hoard] migration step ${step.id} failed:`, message);
      failed.push(`${step.id}: ${message}`);
    }
  }
  if (failed.length) throw new Error(`Migration steps failed: ${failed.join('; ')}`);
}
