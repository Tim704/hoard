import { redirect } from 'next/navigation';

import { getPrefs } from '@/lib/data-prefs';
import { todayIn } from '@/lib/diary';
import { effectiveTimeZone } from '@/lib/prefs';
import { requireUser } from '@/lib/session';

/** `/arena/year` → this year's "best of" (in the user's time zone, G10). */
export default async function YearArenaIndex() {
  const user = await requireUser();
  const today = todayIn(effectiveTimeZone(await getPrefs(user.id)));
  redirect(`/arena/year/${today.slice(0, 4)}`);
}
