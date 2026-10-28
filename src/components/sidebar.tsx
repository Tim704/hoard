'use client';

import { useCallback, useEffect, useState } from 'react';
import { Boxes, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { logoutAction } from '@/lib/actions/auth';
import { SearchEverythingButton } from '@/components/global-search';
import { NavLinks } from '@/components/nav-links';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import type { NotificationSummary } from '@/lib/data-notifications';
import type { SavedViewSummary } from '@/lib/data-views';
import { SIDEBAR_COOKIE } from '@/lib/ui-prefs';
import { cn } from '@/lib/utils';

interface SidebarProps {
  username: string;
  /** Collapsed state read from the cookie on the server (avoids a width flash). */
  initialCollapsed?: boolean;
  notifications: NotificationSummary;
  /** Saved views for the navigation (8.6). */
  views?: SavedViewSummary[];
}

/**
 * The persistent desktop sidebar. Collapses to an icon rail via the header
 * button or Ctrl/Cmd+B; the choice is stored in a cookie. Hidden below `md`,
 * where MobileNav's top bar + drawer takes over.
 */
export function Sidebar({ username, initialCollapsed = false, notifications, views }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Ctrl/Cmd+B toggles the sidebar, except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) {
        return;
      }
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)';

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-muted/40 transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Brand + notification bell + collapse toggle */}
      <div
        className={cn(
          'flex items-center py-5',
          collapsed ? 'flex-col gap-3 px-2' : 'justify-between gap-2 pl-5 pr-3',
        )}
      >
        <div className="flex items-center gap-2">
          <Boxes className="h-6 w-6 shrink-0 text-primary" />
          {!collapsed && <span className="text-lg font-bold tracking-widest">HOARD</span>}
        </div>
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'gap-0.5')}>
          <NotificationBell summary={notifications} side={collapsed ? 'right' : 'bottom'} align="start" />
          <button
            type="button"
            onClick={toggle}
            title={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ToggleIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search everything (2.5); Cmd/Ctrl+K opens the palette (2.6). */}
      <div className={cn('pb-2', collapsed ? 'px-2' : 'px-3')}>
        <SearchEverythingButton collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 space-y-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}>
        <NavLinks collapsed={collapsed} views={views} />
      </nav>

      {/* Footer: signed-in user + theme toggle + logout */}
      <div className={cn('border-t border-border py-3', collapsed ? 'px-2' : 'px-3')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase"
              title={`Signed in as ${username}`}
            >
              {username.slice(0, 1)}
            </span>
            <ThemeToggle />
          </div>
        ) : (
          <div className="flex items-center justify-between px-2 pb-2 text-sm">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="truncate font-medium">{username}</p>
            </div>
            <ThemeToggle />
          </div>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? 'Log out' : undefined}
            aria-label={collapsed ? 'Log out' : undefined}
            className={cn(
              'flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
              collapsed ? 'mt-1 justify-center' : 'px-3',
            )}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>Log out</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}
