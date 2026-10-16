import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/session';

// Root entry: bounce to the dashboard when signed in, otherwise to login.
export default async function HomePage() {
  const u = await getCurrentUser();
  redirect(u ? '/dashboard' : '/login');
}
