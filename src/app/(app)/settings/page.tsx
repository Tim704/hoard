import { SettingsData } from '@/components/settings-data';
import { SettingsForm } from '@/components/settings-form';
import { SettingsNotifications } from '@/components/settings-notifications';
import { SettingsSharing } from '@/components/settings-sharing';
import { SettingsSystem } from '@/components/settings-system';
import { readBackupStatus } from '@/lib/backups';
import { getMyShareLinks } from '@/lib/data-share';
import { getJobRuns } from '@/lib/data-system';
import { getPrefs } from '@/lib/data-prefs';
import { registeredJobs } from '@/lib/jobs';
import { getOwnerId } from '@/lib/notify';
import { effectiveTimeZone, serverTimeZone, toDisplayPrefs } from '@/lib/prefs';
import { requireUser } from '@/lib/session';
import { knownRegions } from '@/lib/timezones';

export const metadata = { title: 'Settings · Hoard' };
// Backup status and job runs change on their own; always render fresh.
export const dynamic = 'force-dynamic';

// Option lists are built here, not in the browser, so the server render and
// hydration use the same ICU data (no mismatched country names).
export default async function SettingsPage() {
  const user = await requireUser();
  const [prefs, ownerId, shareLinks] = await Promise.all([
    getPrefs(user.id),
    getOwnerId(),
    getMyShareLinks(user.id),
  ]);
  // Backups and job errors are server internals: only the owner (the first
  // registered user) sees the System card at all.
  const isOwner = ownerId === user.id;
  const [backup, jobs] = isOwner
    ? await Promise.all([readBackupStatus(), getJobRuns(registeredJobs())])
    : [null, null];
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const regions = knownRegions()
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const zones = Intl.supportedValuesOf('timeZone');

  return (
    <SettingsForm
      initial={toDisplayPrefs(prefs)}
      regions={regions}
      timeZones={zones}
      serverTimeZone={serverTimeZone()}
    >
      <SettingsNotifications initial={prefs.notify} />
      <SettingsSharing links={shareLinks} />
      <SettingsData />
      {backup && jobs && (
        <SettingsSystem backup={backup} jobs={jobs} timeZone={effectiveTimeZone(prefs)} now={new Date()} />
      )}
    </SettingsForm>
  );
}
