// ───────────────────────────────────────────────────────────────────────────
//  Every scheduled job (spec F3), registered in one place. Imported only by
//  src/instrumentation.ts (Node.js runtime) and by server code that shows or
//  triggers jobs. Times are in the server's TZ (default Europe/Berlin).
// ───────────────────────────────────────────────────────────────────────────

import { runBackupWatch } from '@/lib/jobs/backup-watch';
import { runMigrations } from '@/lib/jobs/migration';
import { registerJob, startScheduler } from '@/lib/jobs/scheduler';

registerJob({ name: 'migration', at: 'startup', run: () => runMigrations() });
registerJob({ name: 'backup-watch', at: '09:00', run: () => runBackupWatch() });

export { runJob, registeredJobs } from '@/lib/jobs/scheduler';
export { startScheduler };
