'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Calendar (spec 5.6): create / regenerate and turn off the
//  private iCal feed link. The token lives in the caller's own prefs.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { calendarFeedUrl, newCalendarToken } from '@/lib/calendar-token';
import { changePrefs } from '@/lib/data-prefs';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';
import { publicError } from '@/lib/action-error';

/** Make a new feed link (an existing one stops working). */
export async function createCalendarLink(): Promise<ActionResult & { url?: string }> {
  try {
    const user = await requireUser();
    const token = newCalendarToken();
    // Locked read-modify-write, so a concurrent Settings save can't undo it.
    await changePrefs(user.id, (prefs) => ({ ...prefs, calendarToken: token }));
    revalidatePath('/settings');
    revalidatePath('/calendar');
    return { ok: true, url: calendarFeedUrl(token) };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not create the link.') };
  }
}

/** Turn the feed off: the current link answers "not found" from now on. */
export async function revokeCalendarLink(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await changePrefs(user.id, (prefs) => ({ ...prefs, calendarToken: null }));
    revalidatePath('/settings');
    revalidatePath('/calendar');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not turn the link off.') };
  }
}
