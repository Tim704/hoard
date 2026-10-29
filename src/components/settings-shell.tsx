'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The Settings frame: the groups as a sticky list on the left (lg+) or a
//  one-line strip of tabs that scrolls sideways (phones and tablets), and
//  the open tab's cards. Not from md: next to the app's sidebar, a second
//  column would leave the cards narrower than on a phone there. Tabs are links (/settings?tab=…), so every group has a URL and the
//  server renders only the open one. Old /settings#card links are sent to
//  the card's tab here (src/lib/settings-nav.ts).
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
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

import { SETTINGS_TAB_LABELS, settingsHref, upgradeSettingsLink, type SettingsTab } from '@/lib/settings-nav';
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
  const activeLink = useRef<HTMLAnchorElement>(null);
  useSettingsHashShim(active);

  // Below lg the strip may be scrolled: keep the open tab in view.
  useEffect(() => {
    const link = activeLink.current;
    const strip = link?.closest('ul');
    if (!link || !strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2;
  }, [active]);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-4 space-y-1 lg:mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Changes save as you make them.</p>
      </header>
      <div className="lg:flex lg:items-start lg:gap-8">
        <nav
          aria-label="Settings"
          className="-mx-4 mb-5 border-b border-border sm:-mx-6 lg:sticky lg:top-6 lg:mx-0 lg:mb-0 lg:w-48 lg:shrink-0 lg:border-0"
        >
          <ul className="scrollbar-none relative flex gap-1 overflow-x-auto px-4 pb-2 sm:px-6 lg:flex-col lg:overflow-visible lg:p-0">
            {tabs.map((tab) => {
              const Icon = TAB_ICONS[tab];
              const on = tab === active;
              return (
                <li key={tab} className="shrink-0">
                  <Link
                    ref={on ? activeLink : undefined}
                    href={settingsHref(tab)}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * `/settings#api-tokens` (the old single page's anchors, which notifications
 * and pushed messages still carry) → `/settings?tab=data#api-tokens`, then
 * scroll to the card once its tab is showing. Also on a hash change.
 */
function useSettingsHashShim(active: SettingsTab) {
  const router = useRouter();
  useEffect(() => {
    function follow() {
      const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const there = upgradeSettingsLink(here);
      if (there !== here) {
        router.replace(there, { scroll: false });
        // A different tab: this runs again once it has rendered.
        if (new URL(there, window.location.origin).searchParams.get('tab') !== active) return;
      }
      let id = '';
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return; // a malformed hash names no card
      }
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [active, router]);
}
