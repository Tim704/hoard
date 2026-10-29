import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { GlobalSearchProvider } from '@/components/global-search';
import { MobileNav } from '@/components/mobile-nav';
import { PrefsProvider } from '@/components/prefs-provider';
import { Sidebar } from '@/components/sidebar';
import { getNotificationSummary } from '@/lib/data-notifications';
import { getPrefs } from '@/lib/data-prefs';
import { getSavedViewNames } from '@/lib/data-views';
import { effectiveTimeZone, needsRegionDetection, toDisplayPrefs } from '@/lib/prefs';
import { todayYmd } from '@/lib/release';
import { loginUrlFor } from '@/lib/safe-next';
import { getCurrentUser } from '@/lib/session';
import { SIDEBAR_COOKIE } from '@/lib/ui-prefs';

// Gate every authenticated route behind a valid session, then frame the page
// with the persistent sidebar (desktop) or the sticky top bar + drawer (mobile).
// The user's display settings reach client components through PrefsProvider.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  // Back to the same page after signing in (the path comes from middleware).
  if (!user) redirect(loginUrlFor(headers().get('x-hoard-path')));

  // Read the sidebar state server-side so the first paint has the right width.
  const sidebarCollapsed = cookies().get(SIDEBAR_COOKIE)?.value === '1';
  const [allPrefs, notifications, views] = await Promise.all([
    getPrefs(user.id),
    getNotificationSummary(user.id),
    getSavedViewNames(user.id),
  ]);
  const prefs = toDisplayPrefs(allPrefs);
  // The Friends links (Compare / Watch together / Feed) show only with the opt-in.
  const social = { compare: allPrefs.compareOptIn, feed: allPrefs.feedOptIn };

  return (
    <PrefsProvider
      prefs={prefs}
      detectRegion={needsRegionDetection(allPrefs)}
      today={todayYmd(effectiveTimeZone(allPrefs))}
    >
      <GlobalSearchProvider userId={user.id}>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar
            username={user.username}
            initialCollapsed={sidebarCollapsed}
            notifications={notifications}
            views={views}
            social={social}
          />
          <MobileNav username={user.username} notifications={notifications} views={views} social={social} />
          {/* Clip, not hide, sideways overflow: `hidden` would make <main> a
              scroll container and stop `sticky` inside it (Settings' side
              menu). Browsers without `clip` keep `hidden`. */}
          <main className="flex-1 overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">{children}</main>
        </div>
      </GlobalSearchProvider>
    </PrefsProvider>
  );
}
