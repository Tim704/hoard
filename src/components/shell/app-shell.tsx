'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The app's frame, per layout (src/lib/layouts.ts → nav):
//  - Classic / Organised: the sidebar (desktop), MobileBar (phones);
//  - Minimal: the sidebar of sections, a top bar with Dashboard (desktop),
//    MobileBar (phones);
//  - Fresh: the glass top bar with tabs, at every width.
//  The user menu (every layout) holds the rest: src/lib/nav-model.ts decides.
//
//  The chrome switches around ONE <main> that keeps its place in the tree,
//  so an instant layout switch never remounts the page (the Themes radio
//  keeps focus while arrowing through layouts).
// ───────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLayout, usePrefs } from '@/components/prefs-provider';
import { MobileBar } from '@/components/shell/mobile-bar';
import { NotificationsSheet, useNotificationState } from '@/components/shell/notifications-sheet';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { AccountProvider, type Account } from '@/components/shell/user-menu';
import { clearAllTitleDrafts } from '@/components/title/title-drafts';
import { useFocusReturn } from '@/hooks/use-focus-return';
import { logoutAction } from '@/lib/actions/auth';
import type { NotificationSummary } from '@/lib/data-notifications';
import type { SavedViewSummary } from '@/lib/data-views';
import { navFor, type NavGroup } from '@/lib/nav-model';
import { SIDEBAR_COOKIE } from '@/lib/ui-prefs';

export interface SocialNav {
  compare: boolean;
  feed: boolean;
}

export function AppShell({
  username,
  initialCollapsed = false,
  notifications,
  views,
  social,
  children,
}: {
  username: string;
  /** Collapsed sidebar, read from the cookie on the server (avoids a width flash). */
  initialCollapsed?: boolean;
  notifications: NotificationSummary;
  /** Saved views (8.6), listed under Views. */
  views: SavedViewSummary[];
  /** The viewer's sharing opt-ins (the Friends pages). */
  social: SocialNav;
  children: React.ReactNode;
}) {
  const layout = useLayout();
  const { hiddenSections } = usePrefs();
  const nav = useMemo(
    () => navFor(layout.id, { hidden: hiddenSections, social, savedViews: views }),
    [layout.id, hiddenSections, social, views],
  );
  const hasSidebar = layout.nav !== 'topbar-tabs';
  const topBar = layout.nav === 'topbar-tabs' ? 'tabs' : layout.nav === 'sidebar-sections+topbar' ? 'links' : null;

  // Kept here, not in the sidebar, so it survives a switch through Fresh.
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Ctrl/Cmd+B toggles the sidebar (where there is one), except while typing in a field.
  useEffect(() => {
    if (!hasSidebar) return;
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
  }, [hasSidebar, toggle]);

  const notes = useNotificationState(notifications);
  const [notesOpen, setNotesOpen] = useState(false);
  // Closing the sheet focuses what opened it (the user menu's trigger).
  const { remember: rememberFocus, restore: restoreFocus } = useFocusReturn();
  const logoutForm = useRef<HTMLFormElement>(null);

  const account: Account = useMemo(
    () => ({
      username,
      unread: notes.unread,
      menu: nav.menu,
      openNotifications: () => {
        rememberFocus();
        setNotesOpen(true);
      },
      logout: () => {
        const form = logoutForm.current;
        if (!form) return;
        clearAllTitleDrafts();
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      },
    }),
    [username, notes.unread, nav.menu, rememberFocus],
  );

  // The phone drawer also lists the top bar's links (Minimal's Dashboard).
  const drawerGroups: NavGroup[] = useMemo(
    () => (nav.top.length ? [{ id: 'top', label: null, links: nav.top }, ...nav.primary] : nav.primary),
    [nav],
  );

  // Fixed positions: each slot is either its element or null, so <main>
  // (and the page in it) is never remounted when the chrome changes.
  return (
    <AccountProvider value={account}>
      <div className="flex min-h-screen flex-col md:flex-row">
        {hasSidebar ? <Sidebar groups={nav.primary} collapsed={collapsed} onToggle={toggle} /> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          {hasSidebar ? <MobileBar groups={drawerGroups} /> : null}
          {topBar ? (
            <TopBar variant={topBar} links={topBar === 'tabs' ? nav.primary.flatMap((g) => g.links) : nav.top} />
          ) : null}
          {/* Clip, not hide, sideways overflow: `hidden` would make <main> a
              scroll container and stop `sticky` inside it (Settings' side
              menu). Browsers without `clip` keep `hidden`. */}
          <main className="min-w-0 flex-1 overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">{children}</main>
        </div>
      </div>
      <NotificationsSheet open={notesOpen} onOpenChange={setNotesOpen} notes={notes} onCloseAutoFocus={restoreFocus} />
      <form ref={logoutForm} action={logoutAction} hidden />
    </AccountProvider>
  );
}
