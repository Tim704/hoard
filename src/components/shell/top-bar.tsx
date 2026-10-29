'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Boxes } from 'lucide-react';

import { UserMenu } from '@/components/shell/user-menu';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { isNavLinkActive, type NavLink } from '@/lib/nav-model';
import { cn } from '@/lib/utils';

/**
 * The sticky top bar of the layouts that have one; its height is --topbar-h
 * (globals.css), which sticky things below it (Settings' side list) use.
 *
 * - `links` (Minimal, from md): the top-bar links (Dashboard) and the avatar;
 *   phones get MobileBar instead.
 * - `tabs` (Fresh, every width): a translucent glass bar with the brand, the
 *   tabs (Home and the sections, scrolling sideways when they don't fit) and
 *   the avatar. On phones the tabs drop to a second line of chips.
 */
export function TopBar({ variant, links }: { variant: 'links' | 'tabs'; links: NavLink[] }) {
  const pathname = usePathname();
  const view = useSearchParams().get('view');
  const strip = useRef<HTMLUListElement>(null);

  // When the tabs scroll, keep the open one in view (before paint).
  useIsomorphicLayoutEffect(() => {
    const ul = strip.current;
    const on = ul?.querySelector('[aria-current="page"]');
    if (!ul || !on || ul.scrollWidth <= ul.clientWidth) return;
    const u = ul.getBoundingClientRect();
    const r = on.getBoundingClientRect();
    ul.scrollLeft += r.left - u.left - (u.width - r.width) / 2;
  }, [pathname, variant]);

  if (variant === 'links') {
    return (
      <header data-shell="" className="sticky top-0 z-40 hidden h-[var(--topbar-h)] items-center gap-6 border-b border-border bg-background/90 px-[var(--page-pad)] backdrop-blur supports-[backdrop-filter]:bg-background/75 md:flex">
        <nav aria-label="Top" className="flex min-w-0 items-center gap-1">
          {links.map((link) => {
            const active = isNavLinkActive(link, pathname, view);
            return (
              <Link
                key={link.id}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center">
          <UserMenu trigger="avatar" side="bottom" align="end" />
        </div>
      </header>
    );
  }

  return (
    <header data-shell="" className="sticky top-0 z-40 flex h-[var(--topbar-h)] flex-wrap content-start items-center border-b border-white/10 bg-background/60 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_0_rgb(255_255_255/0.03),0_8px_30px_-12px_rgb(0_0_0/0.6)] backdrop-blur-xl backdrop-saturate-150 md:flex-nowrap md:gap-6 md:px-[var(--page-pad)]">
      <Link
        href="/dashboard"
        className="order-1 flex h-14 shrink-0 items-center gap-2 rounded-md px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:h-auto md:px-0"
      >
        <Boxes className="h-5 w-5 text-primary" />
        <span className="font-display text-base font-semibold tracking-[0.2em]">HOARD</span>
      </Link>
      <div className="order-2 ml-auto flex h-14 items-center pr-4 md:order-3 md:h-auto md:pr-0">
        <UserMenu trigger="avatar" side="bottom" align="end" />
      </div>
      <nav aria-label="Main" className="order-3 w-full min-w-0 md:order-2 md:w-auto md:flex-1 md:self-stretch">
        <ul ref={strip} className="scrollbar-none flex h-11 items-center gap-2 overflow-x-auto px-4 md:h-full md:gap-1 md:px-0">
          {links.map((link) => {
            const active = isNavLinkActive(link, pathname, view);
            return (
              <li key={link.id} className="shrink-0 md:h-full">
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    // Phones: chips.
                    'rounded-full border px-3 py-1',
                    // md+: tabs with an underline for the current one.
                    'md:h-full md:rounded-md md:border-0 md:px-3 md:py-0',
                    "md:after:absolute md:after:inset-x-3 md:after:bottom-0 md:after:h-0.5 md:after:rounded-full md:after:content-['']",
                    active
                      ? 'border-primary bg-primary font-medium text-primary-foreground md:bg-transparent md:text-foreground md:after:bg-primary'
                      : 'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground md:bg-transparent',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
