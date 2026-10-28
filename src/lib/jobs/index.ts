// ───────────────────────────────────────────────────────────────────────────
//  Every scheduled job (spec F3), registered in one place. Imported only by
//  src/instrumentation.ts (Node.js runtime) and by server code that shows or
//  triggers jobs. Times are in the server's TZ (default Europe/Berlin).
// ───────────────────────────────────────────────────────────────────────────

import { runBackupWatch } from '@/lib/jobs/backup-watch';
import { runMetadata } from '@/lib/jobs/metadata';
import { runMigrations } from '@/lib/jobs/migration';
import { runNewSeasons } from '@/lib/jobs/new-seasons';
import { runReleases } from '@/lib/jobs/releases';
import { registerJob, startScheduler } from '@/lib/jobs/scheduler';

registerJob({ name: 'migration', at: 'startup', run: () => runMigrations() });
registerJob({
  name: 'metadata',
  at: '03:30',
  run: async () => {
    await runMetadata();
  },
});
registerJob({
  name: 'new-seasons',
  at: '04:00',
  run: async () => {
    await runNewSeasons();
  },
});
registerJob({
  name: 'releases',
  at: '06:00',
  run: async () => {
    await runReleases();
  },
});
registerJob({ name: 'backup-watch', at: '09:00', run: () => runBackupWatch() });

export { runJob, registeredJobs } from '@/lib/jobs/scheduler';
export { startScheduler };
