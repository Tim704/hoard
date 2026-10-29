'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The user menu: who is signed in, Notifications (with the unread count),
//  Search and the Command palette (the phone's way to search), the pages the
//  layout keeps out of its sidebar or tabs, Theme (not in Fresh), Settings
//  and Log out. The entries come from navFor() (src/lib/nav-model.ts); the
//  shell provides them, with the unread count, through AccountProvider.
// ───────────────────────────────────────────────────────────────────────────

import { Fragment, createContext, useContext, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bell, ChevronsUpDown, Command, LogOut, Moon, Search, Sun } from 'lucide-react';

import { useGlobalSearch } from '@/components/global-search';
import { iconFor } from '@/components/icons';
import { useThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isApplePlatform } from '@/lib/keys';
import { isNavLinkActive, type MenuEntry, type MenuSection, type NavLink } from '@/lib/nav-model';
import { cn } from '@/lib/utils';

export interface Account {
  username: string;
  unread: number;
  menu: MenuSection[];
  openNotifications: () => void;
  logout: () => void;
}

const AccountContext = createContext<Account>({
  username: '',
  unread: 0,
  menu: [],
  openNotifications: () => {},
  logout: () => {},
});

export const AccountProvider = AccountContext.Provider;

/**
 * How the menu is opened:
 * - `avatar`: a round initial (top bars, collapsed sidebars);
 * - `signed-in`: Classic's sidebar footer, "Signed in as" and the name;
 * - `row`: the initial and the name across the sidebar (Organised).
 */
type TriggerStyle = 'avatar' | 'signed-in' | 'row';

const unreadLabel = (n: number) => (n > 0 ? ` (${n} unread notification${n === 1 ? '' : 's'})` : '');

function Initial({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase text-foreground',
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function UnreadDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full bg-primary', className)} />;
}

export function UserMenu({
  trigger = 'avatar',
  side = 'bottom',
  align = 'end',
  className,
}: {
  trigger?: TriggerStyle;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const { username, unread, menu, openNotifications, logout } = useContext(AccountContext);
  const { openSearch, openPalette } = useGlobalSearch();
  const theme = useThemeToggle();
  const pathname = usePathname();
  const view = useSearchParams().get('view');
  // Opening a dialog (Notifications, Search, the palette) waits until the
  // menu has closed and focus is back on the trigger: the opener remembers
  // it, and the dialog returns focus there when it closes (useFocusReturn).
  const afterClose = useRef<(() => void) | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  let button: React.ReactNode;
  if (trigger === 'signed-in') {
    button = (
      <button
        ref={triggerRef}
        type="button"
        data-user-menu=""
        title="Account menu"
        className={cn('-my-1 flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/50', ring, className)}
      >
        <span className="sr-only">Account menu{unreadLabel(unread)}: </span>
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">Signed in as</span>
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{username}</span>
            {unread > 0 && <UnreadDot />}
          </span>
        </span>
        <ChevronsUpDown aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    );
  } else if (trigger === 'row') {
    button = (
      <button
        ref={triggerRef}
        type="button"
        data-user-menu=""
        className={cn('flex w-full min-w-0 items-center gap-2.5 rounded-md p-1.5 text-left text-sm transition-colors hover:bg-accent/60', ring, className)}
      >
        <span className="relative">
          <Initial name={username} className="h-7 w-7 text-xs" />
          {unread > 0 && <UnreadDot className="absolute -right-0.5 -top-0.5 ring-2 ring-background" />}
        </span>
        <span className="sr-only">Account menu{unreadLabel(unread)}: </span>
        <span className="min-w-0 flex-1 truncate font-medium">{username}</span>
        <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    );
  } else {
    button = (
      <button
        ref={triggerRef}
        type="button"
        data-user-menu=""
        aria-label={`Account menu${unreadLabel(unread)}`}
        title={`Signed in as ${username}`}
        className={cn('tap-area relative shrink-0 rounded-full transition-opacity hover:opacity-85', ring, className)}
      >
        <Initial name={username} />
        {unread > 0 && <UnreadDot className="absolute right-0 top-0 h-2.5 w-2.5 ring-2 ring-background" />}
      </button>
    );
  }

  const later = (run: () => void) => () => {
    afterClose.current = run;
  };

  const entry = (e: MenuEntry) => {
    if (e.kind === 'link') return <MenuLink key={e.link.id} link={e.link} pathname={pathname} view={view} />;
    switch (e.action) {
      case 'notifications':
        return (
          <DropdownMenuItem key="notifications" onSelect={later(openNotifications)}>
            <Bell aria-hidden className="text-muted-foreground" />
            Notifications
            {unread > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
                {unread > 99 ? '99+' : unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </DropdownMenuItem>
        );
      case 'search':
        return (
          <DropdownMenuItem key="search" aria-keyshortcuts="/" onSelect={later(() => openSearch(''))}>
            <Search aria-hidden className="text-muted-foreground" />
            Search
            <DropdownMenuShortcut aria-hidden className="hidden sm:inline">
              /
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        );
      case 'palette':
        return (
          <PaletteItem key="palette" onSelect={later(openPalette)} />
        );
      case 'theme':
        if (theme.hidden) return null;
        return (
          <DropdownMenuItem
            key="theme"
            // Stays open, so the change is seen in place.
            onSelect={(ev) => {
              ev.preventDefault();
              theme.toggle();
            }}
          >
            {theme.isDark ? <Sun aria-hidden className="text-muted-foreground" /> : <Moon aria-hidden className="text-muted-foreground" />}
            {theme.isDark ? 'Light mode' : 'Dark mode'}
          </DropdownMenuItem>
        );
      case 'logout':
        return (
          <DropdownMenuItem key="logout" onSelect={logout}>
            <LogOut aria-hidden className="text-muted-foreground" />
            Log out
          </DropdownMenuItem>
        );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className="scrollbar-thin max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 overflow-y-auto"
        onCloseAutoFocus={(ev) => {
          const run = afterClose.current;
          if (!run) return;
          afterClose.current = null;
          ev.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
          run();
        }}
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs text-muted-foreground">Signed in as</span>
          <span className="block truncate font-medium">{username}</span>
        </DropdownMenuLabel>
        {menu.map((section) => (
          <Fragment key={section.id}>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuGroup>{section.entries.map(entry)}</DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuLink({ link, pathname, view }: { link: NavLink; pathname: string; view: string | null }) {
  const Icon = iconFor(link.icon);
  const active = isNavLinkActive(link, pathname, view);
  return (
    <>
      <DropdownMenuItem asChild>
        <Link href={link.href} aria-current={active ? 'page' : undefined} className={cn('cursor-pointer', active && 'font-medium')}>
          <Icon aria-hidden className={active ? 'text-foreground' : 'text-muted-foreground'} />
          {link.label}
        </Link>
      </DropdownMenuItem>
      {link.children?.map((child) => {
        const on = isNavLinkActive(child, pathname, view);
        return (
          <DropdownMenuItem key={child.id} asChild>
            <Link
              href={child.href}
              aria-current={on ? 'page' : undefined}
              className={cn('cursor-pointer pl-8', on ? 'font-medium' : 'text-muted-foreground')}
            >
              <span className="truncate">{child.label}</span>
            </Link>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

/**
 * "Command palette", with its shortcut: ⌘K on Apple platforms, Ctrl K
 * elsewhere. Only rendered while the menu is open, so on the client.
 */
function PaletteItem({ onSelect }: { onSelect: () => void }) {
  const apple = isApplePlatform(navigator.platform || navigator.userAgent);
  return (
    <DropdownMenuItem aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'} onSelect={onSelect}>
      <Command aria-hidden className="text-muted-foreground" />
      Command palette
      <DropdownMenuShortcut aria-hidden className="hidden sm:inline">
        {apple ? '⌘K' : 'Ctrl K'}
      </DropdownMenuShortcut>
    </DropdownMenuItem>
  );
}
