// ───────────────────────────────────────────────────────────────────────────
//  Notifications (spec 5.7). `notify` writes the in-app row (the bell) and then
//  pushes it to the user's own ntfy topic / Discord webhook when configured and
//  the kind is enabled. Pushing never throws: the outcome is recorded on the
//  row (`sentAt` when at least one target accepted it, `error` otherwise).
//
//  Server-only (imports prisma). The pure push code is src/lib/notify-push.ts.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { getPrefs } from '@/lib/data-prefs';
import type { NotifyKind } from '@/lib/prefs';
import { absoluteUrl } from '@/lib/public-url';
import { pushAll, shouldPush, type PushOutcome } from '@/lib/notify-push';

export interface NotifyInput {
  kind: NotifyKind;
  title: string;
  body: string;
  /** In-app path ("/settings") or absolute URL to open. */
  url?: string | null;
}

export interface NotifyResult {
  id: string | null;
  push: PushOutcome;
}

/** Create a notification and push it. Never throws. */
export async function notify(userId: string, input: NotifyInput): Promise<NotifyResult> {
  const title = input.title.slice(0, 200);
  const body = input.body.slice(0, 2000);
  let id: string | null = null;
  try {
    const row = await prisma.notification.create({
      data: { userId, kind: input.kind, title, body, url: input.url ?? null },
      select: { id: true },
    });
    id = row.id;

    const prefs = await getPrefs(userId);
    if (!shouldPush(prefs.notify.kinds, input.kind)) return { id, push: { sent: [], error: null } };
    const push = await pushAll(prefs.notify, {
      title,
      body,
      url: input.url ? absoluteUrl(input.url) : null,
    });
    if (push.sent.length || push.error) {
      await prisma.notification.update({
        where: { id },
        data: { sentAt: push.sent.length ? new Date() : null, error: push.error },
      });
    }
    return { id, push };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'notify failed';
    console.error('[hoard] notify failed:', message);
    return { id, push: { sent: [], error: message } };
  }
}

/** The owner: the first registered user (spec 5.7). Null on an empty install. */
export async function getOwnerId(): Promise<string | null> {
  const owner = await prisma.user.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
  return owner?.id ?? null;
}
