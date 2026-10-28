import { SettingsForm } from '@/components/settings-form';
import { getCurrentPrefs } from '@/lib/data-prefs';
import { serverTimeZone, toDisplayPrefs } from '@/lib/prefs';
import { knownRegions } from '@/lib/timezones';

export const metadata = { title: 'Settings · Hoard' };

// Option lists are built here, not in the browser, so the server render and
// hydration use the same ICU data (no mismatched country names).
export default async function SettingsPage() {
  const prefs = await getCurrentPrefs();
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
    />
  );
}
