import { SettingsForm } from '@/components/settings-form';
import { SettingsNotifications } from '@/components/settings-notifications';
import { SettingsSystem } from '@/components/settings-system';
import { readBackupStatus } from '@/lib/backups';
import { getJobRuns } from '@/lib/data-system';
import { getCurrentPrefs } from '@/lib/data-prefs';
import { registeredJobs } from '@/lib/jobs';
import { effectiveTimeZone, serverTimeZone, toDisplayPrefs } from '@/lib/prefs';
import { knownRegions } from '@/lib/timezones';

export const metadata = { title: 'Settings · Hoard' };
// Backup status and job runs change on their own; always render fresh.
export const dynamic = 'force-dynamic';

// Option lists are built here, not in the browser, so the server render and
// hydration use the same ICU data (no mismatched country names).
export default async function SettingsPage() {
  const [prefs, backup, jobs] = await Promise.all([
    getCurrentPrefs(),
    readBackupStatus(),
    getJobRuns(registeredJobs()),
  ]);
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
      <SettingsSystem backup={backup} jobs={jobs} timeZone={effectiveTimeZone(prefs)} now={new Date()} />
    </SettingsForm>
  );
}
