'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Notification server actions: mark read (one / all) and Settings' "Send
//  test". Every query is scoped to the logged-in user.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notify';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

export async function markNotificationRead(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (typeof id !== 'string' || !id) return { ok: false, error: 'Unknown notification.' };
    await prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update.' };
  }
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update.' };
  }
}

/**
 * Send a test notification to the bell and the saved ntfy / Discord targets.
 * `pushed` lists the targets that accepted it; `error` explains failures.
 */
export async function sendTestNotification(): Promise<ActionResult & { pushed?: string[] }> {
  try {
    const user = await requireUser();
    const res = await notify(user.id, {
      kind: 'test',
      title: 'Test notification',
      body: `Hello ${user.username}, notifications from Hoard work.`,
      url: '/settings#notifications',
    });
    revalidatePath('/', 'layout');
    if (!res.id) return { ok: false, error: 'Could not create the notification.' };
    // push.error only holds generic categories ("ntfy: Could not connect").
    if (res.push.error) return { ok: false, error: res.push.error, pushed: res.push.sent };
    return { ok: true, pushed: res.push.sent };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not send.' };
  }
}
