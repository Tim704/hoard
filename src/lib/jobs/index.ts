// ───────────────────────────────────────────────────────────────────────────
//  Every scheduled job (spec F3), registered in one place. Imported only by
//  src/instrumentation.ts (Node.js runtime) and by server code that shows or
//  triggers jobs. Times are in the server's TZ (default Europe/Berlin).
// ───────────────────────────────────────────────────────────────────────────

import { runBackupWatch } from '@/lib/jobs/backup-watch';
import { runMetadata } from '@/lib/jobs/metadata';
import { runMigrations } from '@/lib/jobs/migration';
import { runAiring, runNewSeasons } from '@/lib/jobs/new-seasons';
import { runReleases } from '@/lib/jobs/releases';
import { registerJob, startScheduler } from '@/lib/jobs/scheduler';
import { runTasteProfiles } from '@/lib/jobs/taste-profile';
import { JOB_TIMES, TASTE_PROFILE_WEEKDAY } from '@/lib/jobs/times';

registerJob({ name: 'migration', at: 'startup', run: () => runMigrations() });
registerJob({
  name: 'metadata',
  at: JOB_TIMES.metadata,
  run: async () => {
    await runMetadata();
  },
});
registerJob({
  name: 'new-seasons',
  at: JOB_TIMES['new-seasons'],
  run: async () => {
    await runNewSeasons();
  },
});
registerJob({
  name: 'releases',
  at: JOB_TIMES.releases,
  run: async () => {
    await runReleases();
  },
});
registerJob({ name: 'airing', at: JOB_TIMES.airing, run: () => runAiring() });
registerJob({ name: 'backup-watch', at: JOB_TIMES['backup-watch'], run: () => runBackupWatch() });
registerJob({
  name: 'taste-profile',
  at: JOB_TIMES['taste-profile'],
  weekday: TASTE_PROFILE_WEEKDAY,
  run: async () => {
    await runTasteProfiles();
  },
});

export { runJob, registeredJobs } from '@/lib/jobs/scheduler';
export { startScheduler };
