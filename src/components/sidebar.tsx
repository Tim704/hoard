'use client';

import { Boxes, LogOut } from 'lucide-react';

import { logoutAction } from '@/lib/actions/auth';
import { NavLinks } from '@/components/nav-links';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The persistent desktop sidebar. Hidden below `md`, where MobileNav's top bar
 * + drawer takes over (both render the shared NavLinks list).
 */
export function Sidebar({ username }: { username: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-muted/40 md:flex">
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 py-5">
        <Boxes className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold tracking-widest">HOARD</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <NavLinks />
      </nav>

      {/* Footer: signed-in user + theme toggle + logout */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center justify-between px-2 pb-2 text-sm">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate font-medium">{username}</p>
          </div>
          <ThemeToggle />
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
