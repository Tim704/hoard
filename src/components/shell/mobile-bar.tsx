'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Boxes, Menu } from 'lucide-react';

import { NavList } from '@/components/shell/nav-list';
import { UserMenu } from '@/components/shell/user-menu';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { NavGroup } from '@/lib/nav-model';

/**
 * The phone chrome of the sidebar layouts: a slim sticky top bar (hamburger,
 * brand, the user menu's avatar) whose hamburger opens a left drawer with
 * the sidebar's groups (and Minimal's top-bar links). Its height is
 * --topbar-h (globals.css). Hidden at `md`+, where the Sidebar takes over.
 */
export function MobileBar({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);

  return (
    <header data-shell="" className="sticky top-0 z-40 flex h-[var(--topbar-h)] items-center gap-1 border-b border-border bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
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
          <SheetHeader className="border-b border-border px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <SheetTitle className="flex items-center gap-2 text-lg font-bold tracking-widest">
              <Boxes className="h-6 w-6 text-primary" />
              HOARD
            </SheetTitle>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
          </SheetHeader>

          {/* Navigation — closes the drawer on any link tap. */}
          <nav
            aria-label="Main"
            className="flex-1 space-y-1 overflow-y-auto px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <NavList groups={groups} onNavigate={() => setOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>

      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-md px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Boxes className="h-5 w-5 text-primary" />
        <span className="text-base font-bold tracking-widest">HOARD</span>
      </Link>

      <div className="ml-auto flex items-center pr-1.5">
        <UserMenu trigger="avatar" side="bottom" align="end" />
      </div>
    </header>
  );
}
