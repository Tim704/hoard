'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Calendar (spec 5.6): create / regenerate and turn off the
//  private iCal feed link. The token lives in the caller's own prefs.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { calendarFeedUrl, newCalendarToken } from '@/lib/calendar-token';
import { getPrefs } from '@/lib/data-prefs';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

/** Make a new feed link (an existing one stops working). */
export async function createCalendarLink(): Promise<ActionResult & { url?: string }> {
  try {
    const user = await requireUser();
    const prefs = await getPrefs(user.id);
    const token = newCalendarToken();
    await prisma.user.update({ where: { id: user.id }, data: { prefs: { ...prefs, calendarToken: token } } });
    revalidatePath('/settings');
    revalidatePath('/calendar');
    return { ok: true, url: calendarFeedUrl(token) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create the link.' };
  }
}

/** Turn the feed off: the current link answers "not found" from now on. */
export async function revokeCalendarLink(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const prefs = await getPrefs(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { prefs: { ...prefs, calendarToken: null } } });
    revalidatePath('/settings');
    revalidatePath('/calendar');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not turn the link off.' };
  }
}
