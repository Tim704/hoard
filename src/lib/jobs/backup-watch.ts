// The `backup-watch` job (09:00): warn the owner (the first registered user)
// when the newest backup is older than 26 h, or none was ever made (the latter
// only once the app has been up for 26 h, so a fresh deploy stays quiet).

import { backupWarning, readBackupStatus } from '@/lib/backups';
import { getOwnerId, notify } from '@/lib/notify';
import { settingsHref } from '@/lib/settings-nav';

export async function runBackupWatch(now = new Date()): Promise<void> {
  const status = await readBackupStatus();
  // Without the /backups mount (local dev) there is nothing to watch. In
  // production a missing mount is itself a problem worth reporting.
  if (!status.mounted && process.env.NODE_ENV !== 'production') return;
  const problem = status.mounted
    ? backupWarning(status, now, process.uptime() * 1000)
    : 'The backup folder is not mounted at /backups, so backups cannot be checked.';
  if (!problem) return;
  const owner = await getOwnerId();
  if (!owner) return;
  await notify(owner, {
    kind: 'backup',
    title: 'Hoard backups need attention',
    body: problem,
    url: settingsHref('system'),
  });
}
