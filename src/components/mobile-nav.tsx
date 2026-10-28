'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Boxes, LogOut, Menu } from 'lucide-react';

import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { SearchEverythingButton } from '@/components/global-search';
import { NavLinks } from '@/components/nav-links';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import type { NotificationSummary } from '@/lib/data-notifications';

/**
 * The phone-only chrome: a slim sticky top bar (hamburger + brand + theme
 * toggle) whose hamburger opens a left drawer with the shared NavLinks list and
 * the signed-in/logout footer. The notification bell sits beside the theme toggle. Hidden at `md`+, where the Sidebar takes over.
 */
export function MobileNav({
  username,
  notifications,
}: {
  username: string;
  notifications: NotificationSummary;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex items-center gap-1 border-b border-border bg-background/95 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle className="flex items-center gap-2 text-lg font-bold tracking-widest">
              <Boxes className="h-6 w-6 text-primary" />
              HOARD
            </SheetTitle>
            <SheetDescription className="sr-only">
              Main navigation
            </SheetDescription>
          </SheetHeader>

          {/* Navigation — closes the drawer on any link tap. */}
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            <NavLinks onNavigate={() => setOpen(false)} />
          </nav>

          {/* Footer: signed-in user + logout (theme toggle lives in the top bar). */}
          <div className="border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="px-2 pb-2 text-sm">
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="truncate font-medium">{username}</p>
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
        </SheetContent>
      </Sheet>

      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-md px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Boxes className="h-5 w-5 text-primary" />
        <span className="text-base font-bold tracking-widest">HOARD</span>
      </Link>

      <div className="ml-auto flex items-center">
        <SearchEverythingButton compact />
        <NotificationBell summary={notifications} />
        <ThemeToggle />
      </div>
    </header>
  );
}
