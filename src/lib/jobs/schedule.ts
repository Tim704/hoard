// ───────────────────────────────────────────────────────────────────────────
//  Pure scheduling rules for the in-process job scheduler (spec G9). No I/O:
//  everything here takes `now` and the last run times as arguments, so DST
//  changes and restarts can be unit-tested.
//
//  A timed job ("HH:MM", optionally only on one weekday) is due when its most
//  recent scheduled moment in the server's time zone is at or before `now` and
//  the job has not run since that moment. A missed run (the server was down)
//  therefore runs once on the next tick, never once per missed day.
// ───────────────────────────────────────────────────────────────────────────

/** When a job runs: once at process start, or daily at a local "HH:MM". */
export type JobTime = 'startup' | `${number}:${number}`;

export interface JobSchedule {
  name: string;
  at: JobTime;
  /** Only on this weekday (0 = Sunday … 6 = Saturday). Daily when unset. */
  weekday?: number;
}

/** Parse "HH:MM" (24 h). Null when malformed or "startup". */
export function parseAt(at: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The wall-clock fields of an instant in a time zone. */
export function zonedParts(ms: number, tz: string) {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** The zone's UTC offset (ms) at an instant. */
function offsetAt(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant of a local wall-clock time. A time skipped by a spring-forward
 * change moves forward (02:30 → 03:30); a time that happens twice on a
 * fall-back day resolves to a single instant.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const o1 = offsetAt(guess, tz);
  const t1 = guess - o1;
  const o2 = offsetAt(t1, tz);
  if (o1 === o2) return t1;
  const t2 = guess - o2;
  if (offsetAt(t2, tz) === o2) return t2;
  return Math.max(t1, t2); // inside a gap: shift forward
}

/**
 * The most recent scheduled moment of a timed job at or before `now`, or null
 * for startup jobs and malformed times.
 */
export function lastOccurrence(job: JobSchedule, now: Date, tz: string): Date | null {
  const at = parseAt(job.at);
  if (!at) return null;
  const today = zonedParts(now.getTime(), tz);
  // Walk back over local calendar days (8 covers a weekly job plus a DST day).
  for (let back = 0; back <= 8; back++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day - back));
    if (job.weekday !== undefined && d.getUTCDay() !== job.weekday) continue;
    const ms = zonedTimeToUtc(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      at.hour,
      at.minute,
      tz,
    );
    if (ms <= now.getTime()) return new Date(ms);
  }
  return null;
}

/**
 * The names of the timed jobs due at `now`: those whose last scheduled moment
 * is after their last run (or that never ran). Startup jobs are never "due";
 * the scheduler runs them once when it starts.
 */
export function dueJobs(
  now: Date,
  tz: string,
  jobs: readonly JobSchedule[],
  lastRuns: Readonly<Record<string, Date | null | undefined>>,
): string[] {
  const due: string[] = [];
  for (const job of jobs) {
    if (job.at === 'startup') continue;
    const occurrence = lastOccurrence(job, now, tz);
    if (!occurrence) continue;
    const last = lastRuns[job.name];
    if (!last || last.getTime() < occurrence.getTime()) due.push(job.name);
  }
  return due;
}

/**
 * A stable signed 32-bit key for a job's Postgres advisory lock (FNV-1a), used
 * together with a fixed namespace key so other apps' locks can't collide.
 */
export function jobLockKey(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}
