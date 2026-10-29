// ───────────────────────────────────────────────────────────────────────────
//  Icon names → lucide components, for the names stored in config: each
//  section's `icon` (src/lib/categories.ts) and the navigation's pages
//  (src/lib/nav-model.ts). Shared by the shell and the dashboard.
// ───────────────────────────────────────────────────────────────────────────

import {
  BarChart3,
  BookOpen,
  BookText,
  Boxes,
  CalendarDays,
  Clapperboard,
  Disc3,
  Filter,
  Gamepad2,
  GitCompareArrows,
  Layers,
  LayoutDashboard,
  Library,
  ListChecks,
  NotebookPen,
  Popcorn,
  Rss,
  Settings,
  Sparkles,
  Tag,
  Tv,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';

export const ICONS: Readonly<Record<string, LucideIcon>> = {
  BarChart3,
  BookOpen,
  BookText,
  Boxes,
  CalendarDays,
  Clapperboard,
  Disc3,
  Filter,
  Gamepad2,
  GitCompareArrows,
  Layers,
  LayoutDashboard,
  Library,
  ListChecks,
  NotebookPen,
  Popcorn,
  Rss,
  Settings,
  Sparkles,
  Tag,
  Tv,
  Upload,
  Users,
};

/** The icon for a stored name (the Boxes brand mark when unknown). */
export function iconFor(name: string): LucideIcon {
  return Object.hasOwn(ICONS, name) ? ICONS[name] : Boxes;
}
