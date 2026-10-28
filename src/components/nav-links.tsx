'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  BookText,
  Boxes,
  Clapperboard,
  Disc3,
  Gamepad2,
  Layers,
  LayoutDashboard,
  Library,
  Settings,
  Sparkles,
  Tv,
  type LucideIcon,
} from 'lucide-react';

import { usePrefs } from '@/components/prefs-provider';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import { cn } from '@/lib/utils';

// Resolve the icon-name strings stored in the category config to real lucide
// components. (Library is imported for potential brand use; kept alongside Boxes.)
const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Clapperboard,
  Tv,
  Sparkles,
  BookText,
  Gamepad2,
  Disc3,
  LayoutDashboard,
  Boxes,
  Library,
};

// Display order for the nav (independent of categories.ts declaration order):
// Books, Movies, Anime, Video Games, then TV, Manga, Music.
const NAV_ORDER: CategorySlug[] = [
  'books',
  'movies',
  'anime',
  'games',
  'tv',
  'manga',
  'music',
];

interface NavLinksProps {
  /** Fired on any link click — lets the mobile drawer close itself on navigate. */
  onNavigate?: () => void;
  /** Icon-only rail mode (collapsed desktop sidebar). */
  collapsed?: boolean;
}

/**
 * The Dashboard + seven-category link list shared by the desktop sidebar and
 * the mobile drawer, with active-route highlighting. Sections hidden in
 * Settings are left out (their pages still work).
 */
export function NavLinks({ onNavigate, collapsed = false }: NavLinksProps) {
  const pathname = usePathname();
  const hidden = new Set<string>(usePrefs().hiddenSections);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (href: string) =>
    cn(
      'flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
      collapsed ? 'justify-center px-0' : 'px-3',
      isActive(href)
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
    );

  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        title={collapsed ? 'Dashboard' : undefined}
        aria-label={collapsed ? 'Dashboard' : undefined}
        className={linkClass('/dashboard')}
      >
        {/* Icon stays the same muted gray regardless of active state. */}
        <LayoutDashboard className="h-4 w-4 shrink-0 text-muted-foreground" />
        {!collapsed && <span>Dashboard</span>}
      </Link>

      {!hidden.has('franchises') && (
        <Link
          href="/franchises"
          onClick={onNavigate}
          title={collapsed ? 'Franchises' : undefined}
          aria-label={collapsed ? 'Franchises' : undefined}
          className={linkClass('/franchises')}
        >
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
          {!collapsed && <span>Franchises</span>}
        </Link>
      )}

      {NAV_ORDER.filter((slug) => !hidden.has(slug)).map((slug) => {
        const config = CATEGORIES[slug];
        const Icon = ICONS[config.icon] ?? Boxes;
        const href = `/${config.slug}`;
        return (
          <Link
            key={config.slug}
            href={href}
            onClick={onNavigate}
            title={collapsed ? config.label : undefined}
            aria-label={collapsed ? config.label : undefined}
            className={linkClass(href)}
          >
            {/* Every nav icon is the same muted gray (active highlights via bg/label). */}
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            {!collapsed && <span>{config.label}</span>}
          </Link>
        );
      })}

      <Link
        href="/settings"
        onClick={onNavigate}
        title={collapsed ? 'Settings' : undefined}
        aria-label={collapsed ? 'Settings' : undefined}
        className={cn(linkClass('/settings'), 'mt-2')}
      >
        <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
        {!collapsed && <span>Settings</span>}
      </Link>
    </>
  );
}
