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
  LayoutDashboard,
  Library,
  Sparkles,
  Tv,
  type LucideIcon,
} from 'lucide-react';

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
}

/**
 * The Dashboard + seven-category link list shared by the desktop sidebar and
 * the mobile drawer, with active-route highlighting.
 */
export function NavLinks({ onNavigate }: NavLinksProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive('/dashboard')
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
      >
        {/* Icon stays the same muted gray regardless of active state. */}
        <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
        <span>Dashboard</span>
      </Link>

      {NAV_ORDER.map((slug) => {
        const config = CATEGORIES[slug];
        const Icon = ICONS[config.icon] ?? Boxes;
        const href = `/${config.slug}`;
        return (
          <Link
            key={config.slug}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            {/* Every nav icon is the same muted gray (active highlights via bg/label). */}
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span>{config.label}</span>
          </Link>
        );
      })}
    </>
  );
}
