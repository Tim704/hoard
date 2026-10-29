import { SettingsAccounts } from '@/components/settings-accounts';
import { SettingsApiTokens } from '@/components/settings-api-tokens';
import { SettingsCalendar } from '@/components/settings-calendar';
import { SettingsData } from '@/components/settings-data';
import { SettingsForm } from '@/components/settings-form';
import { SettingsNotifications } from '@/components/settings-notifications';
import { SettingsSharing } from '@/components/settings-sharing';
import { SettingsCompare, SettingsFeed } from '@/components/settings-social';
import { SettingsSystem } from '@/components/settings-system';
import { readBackupStatus } from '@/lib/backups';
import { calendarFeedUrl } from '@/lib/calendar-token';
import { getApiTokens } from '@/lib/data-api';
import { getMyShareLinks } from '@/lib/data-share';
import { lastfmConfigured } from '@/lib/apis/music';
import { steamConfigured } from '@/lib/apis/steam';
import { aniListPushConfigured } from '@/lib/anilist-sync-server';
import { getLink, publicLink } from '@/lib/external-links';
import { publicBaseUrl } from '@/lib/public-url';
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
  const [prefs, ownerId, shareLinks, steamLink, lastfmLink, anilistLink] = await Promise.all([
    getPrefs(user.id),
    getOwnerId(),
    getMyShareLinks(user.id),
    getLink(user.id, 'steam'),
    getLink(user.id, 'lastfm'),
    getLink(user.id, 'anilist'),
  ]);
  // Backups and job errors are server internals: only the owner (the first
  // registered user) sees the System card at all.
  const isOwner = ownerId === user.id;
  const apiTokens = await getApiTokens(user.id, effectiveTimeZone(prefs));
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
      <SettingsAccounts
        steam={{ configured: steamConfigured(), link: publicLink(steamLink) }}
        lastfm={{ configured: lastfmConfigured(), link: publicLink(lastfmLink) }}
        anilist={{
          username: prefs.anilistUser,
          link: publicLink(anilistLink),
          pushConfigured: aniListPushConfigured(),
          redirectUri: `${publicBaseUrl()}/api/oauth/anilist`,
        }}
      />
      <SettingsNotifications initial={prefs.notify} />
      <SettingsSharing links={shareLinks} />
      <SettingsCalendar initialUrl={prefs.calendarToken ? calendarFeedUrl(prefs.calendarToken) : null} />
      <SettingsCompare initial={prefs.compareOptIn} />
      <SettingsFeed initial={prefs.feedOptIn} />
      <SettingsData />
      <SettingsApiTokens tokens={apiTokens} />
      {backup && jobs && (
        <SettingsSystem backup={backup} jobs={jobs} timeZone={effectiveTimeZone(prefs)} now={new Date()} />
      )}
    </SettingsForm>
  );
}
