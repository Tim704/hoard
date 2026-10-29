// ───────────────────────────────────────────────────────────────────────────
//  The navigation model: every page the app links to, and where each layout
//  puts it (the sidebar or Fresh's tabs, a top bar, or the user menu). The
//  shell (src/components/shell/) only renders what navFor() returns, so the
//  rule "every page stays reachable in every layout" is tested here.
//
//  Pure and client-safe. Icons are lucide names, resolved by
//  src/components/icons.ts.
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORIES, NAV_ORDER, type CategorySlug } from '@/lib/categories';
import type { HideableSection } from '@/lib/display-prefs';
import { LAYOUTS, type LayoutId } from '@/lib/layouts';

export type NavItemId =
  | 'dashboard'
  | 'franchises'
  | CategorySlug
  | 'tonight'
  | 'calendar'
  | 'diary'
  | 'lists'
  | 'tags'
  | 'views'
  | 'stats'
  | 'feed'
  | 'compare'
  | 'together'
  | 'import'
  | 'settings';

/** Organised's sidebar groups (and the order of the menu's sections). */
export type NavGroupId = 'library' | 'plan' | 'organise' | 'insights' | 'friends' | 'manage';

/** The sharing opt-in a page needs: Compare and Watch together need compare, Feed needs feed. */
export type NavGate = 'compare' | 'feed';

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
  /** A lucide icon name (src/components/icons.ts). */
  icon: string;
  group: NavGroupId;
  gate?: NavGate;
  /** Left out while this section is hidden (Settings → General → Sections). */
  hideable?: HideableSection;
}

export const NAV_GROUP_LABELS: Record<NavGroupId, string> = {
  library: 'Library',
  plan: 'Plan & track',
  organise: 'Organise',
  insights: 'Insights',
  friends: 'Friends',
  manage: 'Manage',
};

const GROUP_ORDER: readonly NavGroupId[] = ['library', 'plan', 'organise', 'insights', 'friends', 'manage'];

/** Every page, in the order the navigation lists them. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', group: 'library' },
  { id: 'franchises', label: 'Franchises', href: '/franchises', icon: 'Layers', group: 'library', hideable: 'franchises' },
  ...NAV_ORDER.map(
    (slug): NavItem => ({
      id: slug,
      label: CATEGORIES[slug].label,
      href: `/${slug}`,
      icon: CATEGORIES[slug].icon,
      group: 'library',
      hideable: slug,
    }),
  ),
  { id: 'tonight', label: 'Tonight', href: '/tonight', icon: 'Popcorn', group: 'plan' },
  { id: 'calendar', label: 'Calendar', href: '/calendar', icon: 'CalendarDays', group: 'plan' },
  { id: 'diary', label: 'Diary', href: '/diary', icon: 'NotebookPen', group: 'plan' },
  { id: 'lists', label: 'Lists', href: '/lists', icon: 'ListChecks', group: 'organise' },
  { id: 'tags', label: 'Tags', href: '/tags', icon: 'Tag', group: 'organise' },
  { id: 'views', label: 'Views', href: '/views', icon: 'Filter', group: 'organise' },
  { id: 'stats', label: 'Stats', href: '/stats', icon: 'BarChart3', group: 'insights' },
  { id: 'feed', label: 'Feed', href: '/feed', icon: 'Rss', group: 'friends', gate: 'feed' },
  { id: 'compare', label: 'Compare', href: '/compare', icon: 'GitCompareArrows', group: 'friends', gate: 'compare' },
  { id: 'together', label: 'Watch together', href: '/together', icon: 'Users', group: 'friends', gate: 'compare' },
  { id: 'import', label: 'Import', href: '/import', icon: 'Upload', group: 'manage' },
  { id: 'settings', label: 'Settings', href: '/settings', icon: 'Settings', group: 'manage' },
];

export interface Placement {
  /** The sidebar (Fresh: the top bar's tabs), in this order. */
  primary: readonly NavItemId[];
  /** Links in the top bar (Minimal's Dashboard). */
  top: readonly NavItemId[];
  /** The sidebar is split into labelled groups (Organised). */
  grouped: boolean;
  /** Other names in the sidebar / tabs (Fresh calls the dashboard Home). */
  rename?: Partial<Record<NavItemId, string>>;
}

/**
 * Where each layout puts the pages (the plan's table). Anything not placed
 * in `primary` or `top` goes in the user menu; Settings always does.
 */
export const PLACEMENT: Record<LayoutId, Placement> = {
  classic: { primary: ['dashboard', 'franchises', ...NAV_ORDER], top: [], grouped: false },
  minimal: { primary: [...NAV_ORDER], top: ['dashboard'], grouped: false },
  organised: {
    primary: NAV_ITEMS.map((i) => i.id).filter((id) => id !== 'import' && id !== 'settings'),
    top: [],
    grouped: true,
  },
  fresh: { primary: ['dashboard', ...NAV_ORDER], top: [], grouped: false, rename: { dashboard: 'Home' } },
};

export interface NavLink {
  /** A NavItemId, or `view:<id>` for a saved view. */
  id: string;
  label: string;
  href: string;
  icon: string;
  /** Saved views, under Views. */
  children?: NavLink[];
}

export interface NavGroup {
  /** 'main' for an unlabelled list; 'top' for the top bar's links in the phone drawer. */
  id: NavGroupId | 'main' | 'top';
  /** A heading (Organised), or null for an unlabelled list. */
  label: string | null;
  links: NavLink[];
}

/** User-menu entries that aren't links. */
export type MenuAction = 'notifications' | 'search' | 'palette' | 'theme' | 'logout';
export type MenuEntry = { kind: 'link'; link: NavLink } | { kind: 'action'; action: MenuAction };

/** A run of user-menu entries; the menu puts a separator between sections. */
export interface MenuSection {
  id: 'find' | 'library' | 'track' | 'organise' | 'friends' | 'account';
  entries: MenuEntry[];
}

export interface NavModel {
  primary: NavGroup[];
  top: NavLink[];
  menu: MenuSection[];
}

export interface NavOptions {
  /** Hidden sections (prefs.hiddenSections); anything else in the list is ignored. */
  hidden?: readonly string[];
  /** The viewer's sharing opt-ins. Without them, Friends pages stay out. */
  social?: { compare: boolean; feed: boolean };
  /** Saved views, listed under Views. */
  savedViews?: readonly { id: string; name: string }[];
}

/** The menu section a page goes in when the layout puts it in the menu. */
const MENU_SECTION: Record<NavGroupId, Exclude<MenuSection['id'], 'find' | 'account'>> = {
  library: 'library',
  plan: 'track',
  insights: 'track',
  organise: 'organise',
  friends: 'friends',
  manage: 'library', // never used: Import and Settings go in 'account'
};

/** The pages this viewer may open, in NAV_ITEMS order. */
function permittedItems({ hidden = [], social }: NavOptions): NavItem[] {
  const off = new Set(hidden);
  return NAV_ITEMS.filter(
    (item) => !(item.hideable && off.has(item.hideable)) && !(item.gate && !social?.[item.gate]),
  );
}

function toLink(item: NavItem, opts: NavOptions, label = item.label): NavLink {
  const link: NavLink = { id: item.id, label, href: item.href, icon: item.icon };
  if (item.id === 'views' && opts.savedViews?.length) {
    link.children = opts.savedViews.map((v) => ({
      id: `view:${v.id}`,
      label: v.name,
      href: `/views?view=${encodeURIComponent(v.id)}`,
      icon: 'Filter',
    }));
  }
  return link;
}

/** Where `layout` puts each page this viewer may open. */
export function navFor(layout: LayoutId, opts: NavOptions = {}): NavModel {
  const place = PLACEMENT[layout] ?? PLACEMENT.classic;
  const items = permittedItems(opts);
  const byId = new Map(items.map((i) => [i.id, i]));
  const placed = new Set<NavItemId>([...place.primary, ...place.top]);
  placed.delete('settings');

  const link = (id: NavItemId) => {
    const item = byId.get(id);
    return item ? toLink(item, opts, place.rename?.[id] ?? item.label) : null;
  };
  const links = (ids: readonly NavItemId[]) =>
    ids.filter((id) => id !== 'settings').flatMap((id) => link(id) ?? []);

  let primary: NavGroup[];
  if (place.grouped) {
    const inPrimary = items.filter((i) => place.primary.includes(i.id) && i.id !== 'settings');
    primary = GROUP_ORDER.map((group) => ({
      id: group,
      label: NAV_GROUP_LABELS[group],
      links: inPrimary.filter((i) => i.group === group).map((i) => toLink(i, opts, place.rename?.[i.id] ?? i.label)),
    }));
  } else {
    primary = [{ id: 'main', label: null, links: links(place.primary) }];
  }
  primary = primary.filter((g) => g.links.length > 0);

  // The menu: the search surfaces, the pages placed nowhere else (by
  // section), then Import, Theme, Settings and Log out.
  const rest = items.filter((i) => !placed.has(i.id) && i.group !== 'manage');
  const sections: MenuSection[] = [
    {
      id: 'find',
      entries: [
        { kind: 'action', action: 'notifications' },
        { kind: 'action', action: 'search' },
        { kind: 'action', action: 'palette' },
      ],
    },
  ];
  for (const id of ['library', 'track', 'organise', 'friends'] as const) {
    const entries = rest
      .filter((i) => MENU_SECTION[i.group] === id)
      .map((i): MenuEntry => ({ kind: 'link', link: toLink(i, opts) }));
    if (entries.length) sections.push({ id, entries });
  }
  const account: MenuEntry[] = [];
  const importItem = byId.get('import');
  if (importItem && !placed.has('import')) account.push({ kind: 'link', link: toLink(importItem, opts) });
  if (!LAYOUTS[layout]?.forceDark) account.push({ kind: 'action', action: 'theme' });
  account.push({ kind: 'link', link: toLink(byId.get('settings')!, opts) });
  account.push({ kind: 'action', action: 'logout' });
  sections.push({ id: 'account', entries: account });

  return { primary, top: links(place.top), menu: sections };
}

/**
 * Whether a link is the current page: the page itself or one under it. Views
 * and a saved view (`/views?view=…`) are told apart by the `view` parameter.
 */
export function isNavLinkActive(link: NavLink, pathname: string, view: string | null): boolean {
  if (link.id.startsWith('view:')) return pathname === '/views' && view === link.id.slice('view:'.length);
  if (link.id === 'views' && view) return false;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

/** Every page this viewer may open (the command palette's pages). */
export function paletteLinks(opts: NavOptions = {}): NavLink[] {
  return permittedItems(opts).map((item) => ({ id: item.id, label: item.label, href: item.href, icon: item.icon }));
}
