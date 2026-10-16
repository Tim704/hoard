import { redirect } from 'next/navigation';

import { MobileNav } from '@/components/mobile-nav';
import { Sidebar } from '@/components/sidebar';
import { getCurrentUser } from '@/lib/session';

// Gate every authenticated route behind a valid session, then frame the page
// with the persistent sidebar (desktop) or the sticky top bar + drawer (mobile).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar username={user.username} />
      <MobileNav username={user.username} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
