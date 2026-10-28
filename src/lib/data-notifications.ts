// ───────────────────────────────────────────────────────────────────────────
//  Server-only fetchers for the notification bell.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';

/** What the bell shows: a notification serialized for client components. */
export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  createdAt: string; // ISO
  read: boolean;
}

export interface NotificationSummary {
  unread: number;
  items: NotificationItem[];
}

const BELL_LIMIT = 15;

/** The user's unread count and newest notifications. */
export async function getNotificationSummary(userId: string): Promise<NotificationSummary> {
  const [unread, rows] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: BELL_LIMIT,
      select: { id: true, kind: true, title: true, body: true, url: true, createdAt: true, readAt: true },
    }),
  ]);
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      url: r.url,
      createdAt: r.createdAt.toISOString(),
      read: r.readAt !== null,
    })),
  };
}
