import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { GlobalSearchProvider } from '@/components/global-search';
import { MobileNav } from '@/components/mobile-nav';
import { PrefsProvider } from '@/components/prefs-provider';
import { Sidebar } from '@/components/sidebar';
import { getNotificationSummary } from '@/lib/data-notifications';
import { getPrefs } from '@/lib/data-prefs';
import { needsRegionDetection, toDisplayPrefs } from '@/lib/prefs';
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
  const [allPrefs, notifications] = await Promise.all([
    getPrefs(user.id),
    getNotificationSummary(user.id),
  ]);
  const prefs = toDisplayPrefs(allPrefs);

  return (
    <PrefsProvider prefs={prefs} detectRegion={needsRegionDetection(allPrefs)}>
      <GlobalSearchProvider userId={user.id}>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar
            username={user.username}
            initialCollapsed={sidebarCollapsed}
            notifications={notifications}
          />
          <MobileNav username={user.username} notifications={notifications} />
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </GlobalSearchProvider>
    </PrefsProvider>
  );
}
