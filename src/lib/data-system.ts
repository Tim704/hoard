// ───────────────────────────────────────────────────────────────────────────
//  Server-only fetchers for Settings → System (scheduled jobs).
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';

export interface JobRunInfo {
  name: string;
  /** "startup" or "HH:MM" (plus the weekday for weekly jobs). */
  schedule: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
}

/** Each scheduled job with its last run (null when it never ran). */
export async function getJobRuns(
  jobs: readonly { name: string; at: string; weekday?: number }[],
): Promise<JobRunInfo[]> {
  const rows = await prisma.jobRun.findMany();
  const byName = new Map(rows.map((r) => [r.name, r]));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return jobs.map((j) => {
    const r = byName.get(j.name);
    return {
      name: j.name,
      schedule: j.weekday === undefined ? j.at : `${days[j.weekday]} ${j.at}`,
      lastRunAt: r?.lastRunAt.toISOString() ?? null,
      lastStatus: r?.lastStatus ?? null,
      lastError: r?.lastError ?? null,
      lastDurationMs: r?.lastDurationMs ?? null,
    };
  });
}
