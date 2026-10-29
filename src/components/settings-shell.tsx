'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The Settings frame: the groups as a sticky list on the left (lg+) or a
//  one-line strip of tabs that scrolls sideways (phones and tablets), and
//  the open tab's cards. Not from md: next to the app's sidebar, a second
//  column would leave the cards narrower than on a phone there.
//  Tabs are links (/settings?tab=…), so every group has a URL and the server
//  renders only the open one; a clicked tab shows as open straight away
//  while its cards load. Old /settings#card links are sent to the card's
//  tab here (src/lib/settings-nav.ts).
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Database,
  Link2,
  Palette,
  Server,
  Share2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';

import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { SETTINGS_TAB_LABELS, settingsHref, settingsRedirect, type SettingsTab } from '@/lib/settings-nav';
import { cn } from '@/lib/utils';

const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  themes: Palette,
  general: SlidersHorizontal,
  accounts: Link2,
  notifications: Bell,
  sharing: Share2,
  data: Database,
  system: Server,
};

export function SettingsShell({
  active,
  tabs,
  children,
}: {
  active: SettingsTab;
  tabs: readonly SettingsTab[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [requested, setRequested] = useState<SettingsTab | null>(null);
  // The clicked tab, while its cards load; then the one the server rendered.
  const shown = isPending && requested ? requested : active;
  const shownLink = useRef<HTMLAnchorElement>(null);
  useSettingsHashShim(active, tabs);

  // Below lg the strip may be scrolled: keep the open tab in view. Before
  // paint, so it doesn't jump once the page has hydrated.
  useIsomorphicLayoutEffect(() => {
    const link = shownLink.current;
    const strip = link?.closest('ul');
    if (!link || !strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2;
  }, [shown]);

  function open(e: React.MouseEvent<HTMLAnchorElement>, tab: SettingsTab) {
    // New tab / window and the open tab itself: the link's own behaviour.
    if (tab === shown || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    setRequested(tab);
    startTransition(() => router.push(settingsHref(tab)));
  }

  return (
    <div className="mx-auto max-w-5xl px-[var(--page-pad)] py-4 sm:py-6">
      <header className="mb-4 space-y-1 lg:mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Changes save as you make them.</p>
      </header>
      <div className="lg:flex lg:items-start lg:gap-8">
        {/* Sticks below the layout's sticky top bar, if any (--topbar-h). */}
        <nav
          aria-label="Settings"
          className="-mx-[var(--page-pad)] mb-5 border-b border-border lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)] lg:mx-0 lg:mb-0 lg:w-48 lg:shrink-0 lg:border-0"
        >
          <ul className="scrollbar-none relative flex gap-1 overflow-x-auto px-[var(--page-pad)] pb-2 lg:flex-col lg:overflow-visible lg:p-0">
            {tabs.map((tab) => {
              const Icon = TAB_ICONS[tab];
              const on = tab === shown;
              return (
                <li key={tab} className="shrink-0">
                  <Link
                    ref={on ? shownLink : undefined}
                    href={settingsHref(tab)}
                    onClick={(e) => open(e, tab)}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      // ring-inset: the strip scrolls, so it clips anything outside a tab.
                      'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      on
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {SETTINGS_TAB_LABELS[tab]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {/* While another tab loads, the old cards fade a little (after a
            beat, so a quick switch doesn't flicker). */}
        <div
          aria-busy={isPending || undefined}
          className={cn(
            'min-w-0 flex-1 space-y-6 transition-opacity',
            isPending && 'pointer-events-none opacity-60 delay-150',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * `/settings#api-tokens` (the old single page's anchors, which notifications
 * and pushed messages still carry) → `/settings?tab=data#api-tokens`, then
 * scroll to the card once its tab is showing; a tab that can't be shown
 * (System for a non-owner) → the clean URL of the one that is. Also on a
 * hash change.
 */
function useSettingsHashShim(active: SettingsTab, tabs: readonly SettingsTab[]) {
  const router = useRouter();
  // A string, so a re-render with the same tabs (after a save) doesn't rerun
  // this and scroll back to the card.
  const visible = tabs.join(' ');
  useEffect(() => {
    const shownTabs = visible.split(' ') as SettingsTab[];
    function follow() {
      const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const there = settingsRedirect(here, shownTabs);
      const target = new URL(there ?? here, window.location.origin);
      if (there) {
        router.replace(there, { scroll: false });
        // A different tab: this runs again once it has rendered.
        if (target.searchParams.get('tab') !== active) return;
      }
      let id = '';
      try {
        id = decodeURIComponent(target.hash.slice(1));
      } catch {
        return; // a malformed hash names no card
      }
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [active, router, visible]);
}
