'use client';

import { useEffect, useRef } from 'react';
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

/** How far a clipped edge of the tab strip fades out: px, as in globals.css .edge-fade. */
const FADE_PX = 32;

/**
 * The tab strip's scroll state: with `reveal`, the open tab is scrolled to the
 * middle when it isn't clear of the faded edges, and `data-reveal` keeps the
 * scroll position that reveal left; then `data-fade` names the edges with
 * more to scroll to. STRIP_SCRIPT is the same for the first paint.
 */
function syncStrip(ul: HTMLElement, reveal: boolean) {
  const max = ul.scrollWidth - ul.clientWidth;
  const on = ul.querySelector('[aria-current="page"]');
  if (reveal && on && max > 0) {
    const u = ul.getBoundingClientRect();
    const r = on.getBoundingClientRect();
    if (r.left < u.left + FADE_PX || r.right > u.right - FADE_PX) {
      ul.scrollLeft += r.left - u.left - (u.width - r.width) / 2;
    }
  }
  if (reveal) ul.dataset.reveal = String(ul.scrollLeft);
  const fade = [];
  if (ul.scrollLeft > 1) fade.push('start');
  if (ul.scrollLeft < max - 1) fade.push('end');
  ul.dataset.fade = fade.join(' ');
}

/**
 * Whether the strip still sits where the last automatic reveal left it (or
 * where the browser clamped that to, when the strip got narrower): false
 * once the user has scrolled it.
 */
function untouchedSinceReveal(ul: HTMLElement): boolean {
  const at = Number(ul.dataset.reveal);
  if (!Number.isFinite(at)) return false;
  const max = Math.max(0, ul.scrollWidth - ul.clientWidth);
  return Math.abs(ul.scrollLeft - Math.min(at, max)) <= 1;
}

/**
 * syncStrip(previous sibling, true) as an inline script right after the
 * server-rendered strip: it runs while the page is parsed, so the open tab is
 * in view (and the fades are on) in the first paint, not after hydration.
 * Hand-written ES5, kept in step with syncStrip.
 */
const STRIP_SCRIPT = `(function(){var s=document.currentScript,u=s&&s.previousElementSibling;if(!u)return;var m=u.scrollWidth-u.clientWidth,a=u.querySelector('[aria-current="page"]');if(a&&m>0){var b=u.getBoundingClientRect(),r=a.getBoundingClientRect();if(r.left<b.left+${FADE_PX}||r.right>b.right-${FADE_PX})u.scrollLeft+=r.left-b.left-(b.width-r.width)/2}u.setAttribute('data-reveal',String(u.scrollLeft));var f=[];if(u.scrollLeft>1)f.push('start');if(u.scrollLeft<m-1)f.push('end');u.setAttribute('data-fade',f.join(' '))})()`;

export function TopBar({ variant, links }: { variant: 'links' | 'tabs'; links: NavLink[] }) {
  const pathname = usePathname();
  const view = useSearchParams().get('view');
  const strip = useRef<HTMLUListElement>(null);
  // The tabs shown (Friends comes and goes, a section can be hidden).
  const tabs = links.map((l) => l.id).join(' ');

  // Keep the open tab in view after a navigation, a switch to Fresh or a
  // change of tabs (before paint).
  useIsomorphicLayoutEffect(() => {
    if (strip.current) syncStrip(strip.current, true);
  }, [pathname, variant, tabs]);

  // The fades follow scrolling, resizing, a change of tabs and the display
  // font arriving, which also re-centres the open tab if it moved, unless
  // the user has scrolled the strip since (never undo their scrolling).
  useEffect(() => {
    const ul = strip.current;
    if (!ul) return;
    let live = true;
    const update = () => syncStrip(ul, false);
    update();
    ul.addEventListener('scroll', update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(ul);
    document.fonts?.ready.then(
      () => live && syncStrip(ul, untouchedSinceReveal(ul)),
      () => {},
    );
    return () => {
      live = false;
      ul.removeEventListener('scroll', update);
      resize.disconnect();
    };
  }, [variant, tabs]);

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
      {/* In the DOM (and the tab order): brand, tabs, avatar. Phones move the
          avatar up beside the brand with `order`, and the tabs to a line of
          their own. */}
      <Link
        href="/dashboard"
        className="order-1 flex h-14 shrink-0 items-center gap-2 rounded-md px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:order-none md:h-auto md:px-0"
      >
        <Boxes className="h-5 w-5 text-primary" />
        <span className="font-display text-base font-semibold tracking-[0.2em]">HOARD</span>
      </Link>
      <nav aria-label="Main" className="order-3 w-full min-w-0 md:order-none md:w-auto md:flex-1 md:self-stretch">
        <ul
          ref={strip}
          // data-fade is set by STRIP_SCRIPT before hydration.
          suppressHydrationWarning
          className="edge-fade scrollbar-none flex h-11 items-center gap-2 overflow-x-auto px-4 md:h-full md:gap-1 md:px-0"
        >
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
        <script dangerouslySetInnerHTML={{ __html: STRIP_SCRIPT }} />
      </nav>
      <div className="order-2 ml-auto flex h-14 items-center pr-4 md:order-none md:h-auto md:pr-0">
        <UserMenu trigger="avatar" side="bottom" align="end" />
      </div>
    </header>
  );
}
