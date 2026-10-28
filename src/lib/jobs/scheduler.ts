// ───────────────────────────────────────────────────────────────────────────
//  The in-process job scheduler (spec G9). Started once per Node.js server from
//  src/instrumentation.ts; there is no separate jobs container.
//
//  - Startup jobs run once when the scheduler starts.
//  - Timed jobs: every minute the scheduler asks the pure `dueJobs` (schedule.ts)
//    which jobs are due in the server's TZ, given each job's last run from the
//    `JobRun` table. A missed run (server down) runs once on the next tick.
//  - Each run holds a Postgres advisory lock keyed by the job name, so a second
//    instance skips a job that is already running. It is the transaction-scoped
//    form (`pg_try_advisory_xact_lock`) taken inside an interactive transaction
//    that stays open for the run: Postgres releases it on commit, rollback or a
//    dropped connection, so a crashed or timed-out run can never leak the lock
//    (a session lock would stay on the pooled connection after a rollback).
//  - The run's start time, status, error and duration are upserted into JobRun.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { serverTimeZone } from '@/lib/prefs';
import { dueJobs, jobLockKey, unseededJobs, type JobSchedule, type JobTime } from '@/lib/jobs/schedule';

export interface Job extends JobSchedule {
  at: JobTime;
  run: () => Promise<void>;
}

/** `seeded` = first sighting of a timed job; it first runs at its next slot. */
export type JobOutcome = 'ok' | 'error' | 'skipped' | 'seeded';

/** Namespace for the two-key advisory lock ("HOAR"), so other apps can't collide. */
const LOCK_NAMESPACE = 0x484f4152;
const TICK_MS = 60_000;
/** Longest a single job may hold its lock (the pinned transaction). */
const MAX_JOB_MS = 2 * 60 * 60 * 1000;

const registry = new Map<string, Job>();
const running = new Set<string>();

/** Register (or replace) a job. Names are unique. */
export function registerJob(job: Job): void {
  registry.set(job.name, job);
}

export function registeredJobs(): Job[] {
  return [...registry.values()];
}

async function recordRun(name: string, startedAt: Date, status: JobOutcome, error: string | null) {
  const data = {
    lastRunAt: startedAt,
    lastStatus: status,
    lastError: error ? error.slice(0, 1000) : null,
    lastDurationMs: Date.now() - startedAt.getTime(),
  };
  await prisma.jobRun.upsert({ where: { name }, create: { name, ...data }, update: data });
}

/**
 * Run one job now under its advisory lock and record the outcome. Resolves to
 * 'skipped' when another run (here or in another instance) holds the lock.
 * Never throws.
 */
export async function runJob(name: string): Promise<JobOutcome> {
  const job = registry.get(name);
  if (!job) return 'skipped';
  if (running.has(name)) return 'skipped';
  running.add(name);
  const startedAt = new Date();
  const key = jobLockKey(name);
  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${LOCK_NAMESPACE}::int, ${key}::int) AS locked`;
        if (!locked) return { status: 'skipped' as const, error: null };
        // The job uses the normal client, not `tx`: the transaction only holds the lock.
        try {
          await job.run();
          return { status: 'ok' as const, error: null };
        } catch (err) {
          return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) };
        }
      },
      { maxWait: 10_000, timeout: MAX_JOB_MS },
    );
    if (outcome.status === 'skipped') return 'skipped';
    if (outcome.error) console.error(`[hoard] job ${name} failed:`, outcome.error);
    await recordRun(name, startedAt, outcome.status, outcome.error);
    return outcome.status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[hoard] job ${name} could not run:`, message);
    try {
      await recordRun(name, startedAt, 'error', message);
    } catch {
      // the database is unreachable; the next tick retries
    }
    return 'error';
  } finally {
    running.delete(name);
  }
}

/** One scheduler tick: run every due timed job (one after another). */
export async function tick(now = new Date()): Promise<void> {
  const jobs = registeredJobs();
  let lastRuns: Record<string, Date>;
  try {
    const rows = await prisma.jobRun.findMany({ select: { name: true, lastRunAt: true } });
    lastRuns = Object.fromEntries(rows.map((r) => [r.name, r.lastRunAt]));
  } catch (err) {
    console.error('[hoard] scheduler tick skipped (database):', err instanceof Error ? err.message : err);
    return;
  }
  // A timed job seen for the first time (fresh deploy, newly added job) is
  // seeded instead of run, so it waits for its next slot.
  for (const name of unseededJobs(jobs, lastRuns)) {
    try {
      // `update: {}` keeps a row another instance seeded or ran meanwhile.
      await prisma.jobRun.upsert({
        where: { name },
        create: { name, lastRunAt: now, lastStatus: 'seeded', lastDurationMs: 0 },
        update: {},
      });
    } catch (err) {
      console.error(`[hoard] could not seed job ${name}:`, err instanceof Error ? err.message : err);
    }
  }
  for (const name of dueJobs(now, serverTimeZone(), jobs, lastRuns)) {
    await runJob(name);
  }
}

const state = globalThis as unknown as { __hoardScheduler?: { timer: NodeJS.Timeout } };

/** Start the scheduler once per process (idempotent across dev hot reloads). */
export function startScheduler(): void {
  if (state.__hoardScheduler) return;
  let ticking = false;
  const safeTick = async () => {
    if (ticking) return; // a long job is still running; the next tick catches up
    ticking = true;
    try {
      await tick();
    } finally {
      ticking = false;
    }
  };
  const timer = setInterval(() => void safeTick(), TICK_MS);
  timer.unref?.();
  state.__hoardScheduler = { timer };
  console.log(`[hoard] scheduler started (${registry.size} jobs, TZ ${serverTimeZone()})`);

  // Startup jobs first (the migration job), then an immediate catch-up tick.
  void (async () => {
    for (const job of registeredJobs()) {
      if (job.at === 'startup') await runJob(job.name);
    }
    await safeTick();
  })();
}
