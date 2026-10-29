'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Notifications (spec 5.7), opened from the user menu: the newest ones in a
//  side sheet with "Mark all read". The list comes from the (app) layout;
//  the server actions revalidate it, and local state keeps the UI instant.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/actions/notifications';
import type { NotificationItem, NotificationSummary } from '@/lib/data-notifications';
import { cn } from '@/lib/utils';

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Only in-app paths become links (notifications may carry external URLs). */
const isInternal = (url: string | null): url is string => !!url && url.startsWith('/') && !url.startsWith('//');

export interface NotificationState {
  unread: number;
  items: NotificationItem[];
  markRead: (id: string) => void;
  markAll: () => void;
}

/**
 * The notifications with optimistic "read" marks. A fresh server render
 * (navigation, revalidation) replaces the local copy.
 */
export function useNotificationState(summary: NotificationSummary): NotificationState {
  const router = useRouter();
  const [state, setState] = useState(summary);
  const [, startTransition] = useTransition();

  useEffect(() => setState(summary), [summary]);

  function markRead(id: string) {
    const item = state.items.find((n) => n.id === id);
    if (!item || item.read) return;
    setState((s) => ({
      unread: Math.max(0, s.unread - 1),
      items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }

  function markAll() {
    const before = state;
    setState((s) => ({ unread: 0, items: s.items.map((n) => ({ ...n, read: true })) }));
    startTransition(async () => {
      const res = await markAllNotificationsRead();
      if (!res.ok) {
        setState(before);
        toast.error(res.error ?? 'Could not mark notifications as read.');
      } else {
        router.refresh();
      }
    });
  }

  return { unread: state.unread, items: state.items, markRead, markAll };
}

/** The notifications, newest first; opening one marks it read. */
export function NotificationList({
  items,
  onRead,
  onNavigate,
}: {
  items: NotificationItem[];
  onRead: (id: string) => void;
  /** After following a notification's in-app link (closes the sheet). */
  onNavigate?: () => void;
}) {
  if (items.length === 0) {
    return <p className="px-3 py-10 text-center text-sm text-muted-foreground">No notifications yet.</p>;
  }
  return (
    <ul className="space-y-0.5">
      {items.map((n) => {
        const body = (
          <>
            <span
              aria-hidden
              className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')}
            />
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm', n.read ? 'text-muted-foreground' : 'font-medium')}>
                {n.title}
                {!n.read && <span className="sr-only"> (unread)</span>}
              </span>
              <span className="line-clamp-3 block text-xs text-muted-foreground">{n.body}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{timeAgo(n.createdAt)}</span>
            </span>
          </>
        );
        const row =
          'flex w-full gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';
        return (
          <li key={n.id}>
            {isInternal(n.url) ? (
              <Link
                href={n.url}
                className={row}
                onClick={() => {
                  onRead(n.id);
                  onNavigate?.();
                }}
              >
                {body}
              </Link>
            ) : (
              <button type="button" className={row} onClick={() => onRead(n.id)}>
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The side sheet the user menu's "Notifications" opens. */
export function NotificationsSheet({
  open,
  onOpenChange,
  notes,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: NotificationState;
  /** Where focus goes on close (it has no trigger of its own): useFocusReturn. */
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-sm"
        // Focus the list, not "Mark all read" (Radix's first tabbable), so
        // opening doesn't ring a button; Tab goes on from there.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          list.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetHeader className="space-y-0 border-b border-border px-4 pb-3 pr-12 pt-[max(0.75rem,env(safe-area-inset-top))] text-left">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <SheetTitle className="truncate text-base">Notifications</SheetTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={notes.unread === 0}
              onClick={notes.markAll}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
              Mark all read
            </Button>
          </div>
          <SheetDescription className="sr-only">
            {notes.unread ? `${notes.unread} unread` : 'Nothing unread'}
          </SheetDescription>
        </SheetHeader>
        <div
          ref={list}
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] focus:outline-none"
        >
          <NotificationList items={notes.items} onRead={notes.markRead} onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
