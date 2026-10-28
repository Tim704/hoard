import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { MobileNav } from '@/components/mobile-nav';
import { PrefsProvider } from '@/components/prefs-provider';
import { Sidebar } from '@/components/sidebar';
import { getPrefs } from '@/lib/data-prefs';
import { needsRegionDetection, toDisplayPrefs } from '@/lib/prefs';
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
  if (!user) redirect('/login');

  // Read the sidebar state server-side so the first paint has the right width.
  const sidebarCollapsed = cookies().get(SIDEBAR_COOKIE)?.value === '1';
  const allPrefs = await getPrefs(user.id);
  const prefs = toDisplayPrefs(allPrefs);

  return (
    <PrefsProvider prefs={prefs} detectRegion={needsRegionDetection(allPrefs)}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar username={user.username} initialCollapsed={sidebarCollapsed} />
        <MobileNav username={user.username} />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </PrefsProvider>
  );
}
