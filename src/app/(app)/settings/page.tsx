import { SettingsAccounts } from '@/components/settings-accounts';
import { SettingsApiTokens } from '@/components/settings-api-tokens';
import { SettingsCalendar } from '@/components/settings-calendar';
import { SettingsData } from '@/components/settings-data';
import { SettingsForm } from '@/components/settings-form';
import { SettingsNotifications } from '@/components/settings-notifications';
import { SettingsSharing } from '@/components/settings-sharing';
import { SettingsShell } from '@/components/settings-shell';
import { SettingsCompare, SettingsFeed } from '@/components/settings-social';
import { SettingsSystem } from '@/components/settings-system';
import { SettingsThemes } from '@/components/settings-themes';
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
import { effectiveTimeZone, serverTimeZone, toDisplayPrefs, type Prefs } from '@/lib/prefs';
import { requireUser } from '@/lib/session';
import { resolveSettingsTab, settingsTabsFor } from '@/lib/settings-nav';

export const metadata = { title: 'Settings · Hoard' };
// Backup status and job runs change on their own; always render fresh.
export const dynamic = 'force-dynamic';

type Search = { tab?: string | string[]; anilist?: string | string[] };

/**
 * `/settings?tab=themes|general|accounts|notifications|sharing|data|system`:
 * a side menu of groups (src/components/settings-shell.tsx). Only the open
 * tab's data is loaded. System (backups, job errors) is the owner's alone;
 * anyone else asking for it gets General, as does a bare /settings.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const [prefs, ownerId] = await Promise.all([getPrefs(user.id), getOwnerId()]);
  // Backups and job errors are server internals: only the owner (the first
  // registered user) sees the System tab at all.
  const isOwner = ownerId === user.id;
  const tab = resolveSettingsTab(searchParams, isOwner);

  return (
    <SettingsShell active={tab} tabs={settingsTabsFor(isOwner)}>
      {tab === 'themes' && <SettingsThemes />}
      {tab === 'general' && (
        // The zone list is built here, not in the browser, so the server
        // render and hydration use the same ICU data.
        <SettingsForm
          initial={toDisplayPrefs(prefs)}
          timeZones={Intl.supportedValuesOf('timeZone')}
          serverTimeZone={serverTimeZone()}
        />
      )}
      {tab === 'accounts' && <AccountsTab userId={user.id} prefs={prefs} />}
      {tab === 'notifications' && <SettingsNotifications initial={prefs.notify} />}
      {tab === 'sharing' && <SharingTab userId={user.id} prefs={prefs} />}
      {tab === 'data' && <DataTab userId={user.id} prefs={prefs} />}
      {tab === 'system' && <SystemTab prefs={prefs} />}
    </SettingsShell>
  );
}

async function AccountsTab({ userId, prefs }: { userId: string; prefs: Prefs }) {
  const [steamLink, lastfmLink, anilistLink] = await Promise.all([
    getLink(userId, 'steam'),
    getLink(userId, 'lastfm'),
    getLink(userId, 'anilist'),
  ]);
  return (
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
  );
}

/** Sharing & privacy: public links, the iCal feed, and the Compare and Feed opt-ins. */
async function SharingTab({ userId, prefs }: { userId: string; prefs: Prefs }) {
  const shareLinks = await getMyShareLinks(userId);
  return (
    <>
      <SettingsSharing links={shareLinks} />
      <SettingsCalendar initialUrl={prefs.calendarToken ? calendarFeedUrl(prefs.calendarToken) : null} />
      <SettingsCompare initial={prefs.compareOptIn} />
      <SettingsFeed initial={prefs.feedOptIn} />
    </>
  );
}

async function DataTab({ userId, prefs }: { userId: string; prefs: Prefs }) {
  const apiTokens = await getApiTokens(userId, effectiveTimeZone(prefs));
  return (
    <>
      <SettingsData />
      <SettingsApiTokens tokens={apiTokens} />
    </>
  );
}

async function SystemTab({ prefs }: { prefs: Prefs }) {
  const [backup, jobs] = await Promise.all([readBackupStatus(), getJobRuns(registeredJobs())]);
  return <SettingsSystem backup={backup} jobs={jobs} timeZone={effectiveTimeZone(prefs)} now={new Date()} />;
}
