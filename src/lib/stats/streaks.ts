// ───────────────────────────────────────────────────────────────────────────
//  Streaks (spec 6.7): runs of consecutive calendar days with any activity
//  event or diary entry, in the user's time zone (G10). Pure and client-safe.
//
//  Instants (event times) become YYYY-MM-DD days in the zone first; diary
//  entries already are days. Day arithmetic is then done on the day strings
//  (UTC day numbers), so a DST switch never makes a day 23 or 25 hours long.
// ───────────────────────────────────────────────────────────────────────────

/** A formatter per zone (formatting thousands of events with one is cheap). */
function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  }
}

/** The calendar days (YYYY-MM-DD in `timeZone`) of some instants, de-duplicated. */
export function daysOf(instants: Iterable<Date>, timeZone: string): Set<string> {
  const fmt = dayFormatter(timeZone);
  const out = new Set<string>();
  for (const at of instants) {
    const parts = fmt.formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    out.add(`${get('year')}-${get('month')}-${get('day')}`);
  }
  return out;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Days since 1970-01-01 for a YYYY-MM-DD string. */
export function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export interface Streaks {
  /** Consecutive active days ending today, or yesterday when today has nothing yet. */
  current: number;
  longest: number;
  /** The last day of the longest run (the latest one on ties), or null. */
  longestEnd: string | null;
  /** Distinct active days. */
  activeDays: number;
}

/**
 * Current and longest streaks over some active days. Today not being active
 * yet doesn't break the current streak (the day isn't over); a gap of a whole
 * day does. Days after `today` (clock skew, future-dated diary rows) are ignored.
 */
export function streaks(days: Iterable<string>, today: string): Streaks {
  const t = dayNumber(today);
  const nums = [...new Set([...days].filter((d) => YMD.test(d)).map(dayNumber))]
    .filter((n) => Number.isFinite(n) && n <= t)
    .sort((a, b) => a - b);
  if (nums.length === 0) return { current: 0, longest: 0, longestEnd: null, activeDays: 0 };

  let longest = 1;
  let longestEndNum = nums[0];
  let run = 1;
  for (let i = 1; i < nums.length; i++) {
    run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    if (run >= longest) {
      longest = run;
      longestEndNum = nums[i];
    }
  }

  const last = nums[nums.length - 1];
  let current = 0;
  if (last === t || last === t - 1) {
    current = 1;
    for (let i = nums.length - 1; i > 0 && nums[i - 1] === nums[i] - 1; i--) current += 1;
  }

  const end = new Date(longestEndNum * 86_400_000).toISOString().slice(0, 10);
  return { current, longest, longestEnd: end, activeDays: nums.length };
}
