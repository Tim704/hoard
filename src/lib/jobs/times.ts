// When each timed job runs (server TZ, spec F3), in one place so the order
// that matters is visible and tested: `airing` (06:30) must come after
// `releases` (06:00), or an anime episode that aired before 06:00 would
// already point at next week when "New episode today" is decided.

export const JOB_TIMES = {
  metadata: '03:30',
  'new-seasons': '04:00',
  releases: '06:00',
  airing: '06:30',
  'backup-watch': '09:00',
  /** Sundays only (TASTE_PROFILE_WEEKDAY). */
  'taste-profile': '05:45',
} as const;

/** The taste-profile job's day: Sunday (0 = Sunday … 6 = Saturday). */
export const TASTE_PROFILE_WEEKDAY = 0;
