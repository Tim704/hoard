// ───────────────────────────────────────────────────────────────────────────
//  Where the migration job remembers which steps finished: one JobRun row per
//  step, named `migration:<step id>` (Settings → System lists only the
//  registered jobs, so these markers stay out of sight).
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';

export interface MigrationStore {
  /** True once the step finished cleanly. */
  isDone(id: string): Promise<boolean>;
  /** Record a clean run of the step. */
  markDone(id: string, durationMs: number): Promise<void>;
}

export const migrationMarker = (id: string) => `migration:${id}`;

export const prismaMigrationStore: MigrationStore = {
  async isDone(id) {
    const row = await prisma.jobRun.findUnique({ where: { name: migrationMarker(id) } });
    return row?.lastStatus === 'ok';
  },
  async markDone(id, durationMs) {
    const data = { lastRunAt: new Date(), lastStatus: 'ok', lastError: null, lastDurationMs: durationMs };
    await prisma.jobRun.upsert({
      where: { name: migrationMarker(id) },
      create: { name: migrationMarker(id), ...data },
      update: data,
    });
  },
};
