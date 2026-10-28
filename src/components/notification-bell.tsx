'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The notification bell (spec 5.7): unread badge + a dropdown with the newest
//  notifications and "Mark all read". The list comes from the (app) layout;
//  the server actions revalidate it, and local state keeps the UI instant.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/actions/notifications';
import type { NotificationSummary } from '@/lib/data-notifications';
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

export function NotificationBell({
  summary,
  align = 'end',
  side = 'bottom',
}: {
  summary: NotificationSummary;
  align?: 'start' | 'end';
  side?: 'bottom' | 'right';
}) {
  const router = useRouter();
  const [state, setState] = useState(summary);
  const [, startTransition] = useTransition();

  // A fresh server render (navigation, revalidation) replaces the local copy.
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

  const label = state.unread ? `Notifications (${state.unread} unread)` : 'Notifications';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          className="relative text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {state.unread > 0 && (
            <span
              aria-hidden
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
            >
              {state.unread > 9 ? '9+' : state.unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        className="w-[min(22rem,calc(100vw-1rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm">Notifications</DropdownMenuLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={state.unread === 0}
            onClick={(e) => {
              e.preventDefault();
              markAll();
            }}
          >
            <CheckCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
            Mark all read
          </Button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[min(24rem,70vh)] overflow-y-auto p-1">
          {state.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            state.items.map((n) => {
              const body = (
                <div className="flex w-full gap-2">
                  <span
                    aria-hidden
                    className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', n.read ? 'text-muted-foreground' : 'font-medium')}>{n.title}</p>
                    <p className="line-clamp-3 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              );
              return isInternal(n.url) ? (
                <DropdownMenuItem key={n.id} asChild className="cursor-pointer items-start">
                  <Link href={n.url} onClick={() => markRead(n.id)}>
                    {body}
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={n.id} className="items-start" onSelect={() => markRead(n.id)}>
                  {body}
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
