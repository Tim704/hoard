// ───────────────────────────────────────────────────────────────────────────
//  The four layouts (Settings → Themes): one set of pages, four skins. Each
//  layout picks the navigation, how much a card shows, the section toolbar
//  style and whether it forces dark mode. Colours, fonts and spacing (its
//  density) live in CSS (`[data-layout=…]` blocks in src/app/globals.css) and
//  shared components style themselves with the `classic:` / `minimal:` /
//  `organised:` / `fresh:` Tailwind variants (tailwind.config.ts).
//
//  Pure and dependency-free: tailwind.config.ts imports it too. The client
//  hook `useLayout()` lives in src/components/prefs-provider.tsx.
// ───────────────────────────────────────────────────────────────────────────

export const LAYOUT_IDS = ['classic', 'minimal', 'organised', 'fresh'] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export const DEFAULT_LAYOUT: LayoutId = 'classic';

/**
 * Navigation shape:
 * - `sidebar-flat`: the pre-roadmap sidebar (Dashboard, Franchises, the sections);
 * - `sidebar-sections+topbar`: the sidebar holds the 7 sections, a top bar the rest;
 * - `sidebar-grouped`: a sidebar of labelled groups;
 * - `topbar-tabs`: no sidebar, a top bar with scrollable tabs.
 */
export type NavStyle = 'sidebar-flat' | 'sidebar-sections+topbar' | 'sidebar-grouped' | 'topbar-tabs';
/** How much a media card shows. */
export type CardStyle = 'plain' | 'poster' | 'one-badge' | 'cinematic';
/** Section toolbar: labelled buttons, or icons with tooltips. */
export type ToolbarStyle = 'labelled' | 'icons';

export interface LayoutConfig {
  id: LayoutId;
  label: string;
  description: string;
  nav: NavStyle;
  card: CardStyle;
  toolbar: ToolbarStyle;
  /** Dark mode regardless of the stored theme; the light/dark toggle hides. */
  forceDark: boolean;
  /**
   * The media grid's classes: its columns per breakpoint. The gap between
   * cards is the layout's --grid-gap (globals.css), the one place card
   * spacing is set, so every gridCols uses gap-[var(--grid-gap)].
   */
  gridCols: string;
}

export const LAYOUTS: Record<LayoutId, LayoutConfig> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    description: 'The original Hoard: a full sidebar, labelled buttons and plain cards.',
    nav: 'sidebar-flat',
    card: 'plain',
    toolbar: 'labelled',
    forceDark: false,
    // MediaGrid's columns before layouts; --grid-gap is its old gap-3 sm:gap-4.
    gridCols: 'grid grid-cols-2 gap-[var(--grid-gap)] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    description: 'Airy and quiet: the sections in the sidebar, everything else up top, big posters.',
    nav: 'sidebar-sections+topbar',
    card: 'poster',
    toolbar: 'icons',
    forceDark: false,
    gridCols: 'grid grid-cols-2 gap-[var(--grid-gap)] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
  },
  organised: {
    id: 'organised',
    label: 'Organised',
    description: 'Tidy and dense: a grouped sidebar and cards with one badge that matters.',
    nav: 'sidebar-grouped',
    card: 'one-badge',
    toolbar: 'icons',
    forceDark: false,
    gridCols: 'grid grid-cols-2 gap-[var(--grid-gap)] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
  },
  fresh: {
    id: 'fresh',
    label: 'Fresh',
    description: 'Cinematic dark: a glass top bar with tabs and large, image-led cards.',
    nav: 'topbar-tabs',
    card: 'cinematic',
    toolbar: 'icons',
    forceDark: true,
    gridCols: 'grid grid-cols-2 gap-[var(--grid-gap)] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  },
};

export function isLayoutId(value: unknown): value is LayoutId {
  return typeof value === 'string' && (LAYOUT_IDS as readonly string[]).includes(value);
}

/** Any stored or attribute value → a known layout (Classic when unknown). */
export function resolveLayout(value: unknown): LayoutId {
  return isLayoutId(value) ? value : DEFAULT_LAYOUT;
}
