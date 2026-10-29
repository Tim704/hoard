import { describe, expect, it } from 'vitest';

import { ICONS } from '@/components/icons';
import { CATEGORIES, NAV_ORDER } from './categories';
import { LAYOUT_IDS, LAYOUTS, type LayoutId } from './layouts';
import {
  NAV_ITEMS,
  PLACEMENT,
  isNavLinkActive,
  navFor,
  paletteLinks,
  type MenuAction,
  type NavLink,
  type NavModel,
  type NavOptions,
} from './nav-model';
import { HIDEABLE_SECTIONS } from './prefs';

const ALL_SOCIAL = { compare: true, feed: true };
const NO_SOCIAL = { compare: false, feed: false };
const VIEWS = [
  { id: 'v1', name: 'Sci-fi favourites' },
  { id: 'v2', name: 'Comfort rewatches' },
];

/** Every link in a model, saved views included, with where it sits. */
function allLinks(model: NavModel): Array<{ link: NavLink; where: 'primary' | 'top' | 'menu' }> {
  const out: Array<{ link: NavLink; where: 'primary' | 'top' | 'menu' }> = [];
  const add = (link: NavLink, where: 'primary' | 'top' | 'menu') => {
    out.push({ link, where });
    for (const child of link.children ?? []) out.push({ link: child, where });
  };
  for (const g of model.primary) for (const l of g.links) add(l, 'primary');
  for (const l of model.top) add(l, 'top');
  for (const s of model.menu) for (const e of s.entries) if (e.kind === 'link') add(e.link, 'menu');
  return out;
}

const ids = (model: NavModel) => allLinks(model).map((x) => x.link.id);
const primaryIds = (model: NavModel) => model.primary.flatMap((g) => g.links.map((l) => l.id));
const menuLinkIds = (model: NavModel) =>
  model.menu.flatMap((s) => s.entries.flatMap((e) => (e.kind === 'link' ? [e.link.id] : [])));
const actions = (model: NavModel): MenuAction[] =>
  model.menu.flatMap((s) => s.entries.flatMap((e) => (e.kind === 'action' ? [e.action] : [])));

/** What the user may open, given the options (the model's contract). */
function permitted({ hidden = [], social = NO_SOCIAL, savedViews = [] }: NavOptions): string[] {
  const off = new Set<string>(hidden);
  const items = NAV_ITEMS.filter((i) => !(i.hideable && off.has(i.hideable)) && !(i.gate && !social[i.gate]));
  return [...items.map((i) => i.id), ...savedViews.map((v) => `view:${v.id}`)];
}

const OPTION_CASES: Array<[string, NavOptions]> = [
  ['defaults', {}],
  ['all social + views', { social: ALL_SOCIAL, savedViews: VIEWS }],
  ['compare only', { social: { compare: true, feed: false } }],
  ['feed only', { social: { compare: false, feed: true }, savedViews: VIEWS.slice(0, 1) }],
  ['some sections hidden', { hidden: ['books', 'music', 'franchises'], social: ALL_SOCIAL }],
  ['every section hidden', { hidden: [...HIDEABLE_SECTIONS], social: ALL_SOCIAL, savedViews: VIEWS }],
];

describe('nav-model', () => {
  it('lists every page once, with icons that resolve', () => {
    const itemIds = NAV_ITEMS.map((i) => i.id);
    expect(new Set(itemIds).size).toBe(itemIds.length);
    expect(itemIds).toEqual([
      'dashboard',
      'franchises',
      ...NAV_ORDER,
      'tonight',
      'calendar',
      'diary',
      'lists',
      'tags',
      'views',
      'stats',
      'feed',
      'compare',
      'together',
      'import',
      'settings',
    ]);
    for (const item of NAV_ITEMS) {
      expect(Object.hasOwn(ICONS, item.icon), item.icon).toBe(true);
      expect(item.href.startsWith('/')).toBe(true);
    }
    for (const slug of NAV_ORDER) expect(Object.hasOwn(ICONS, CATEGORIES[slug].icon)).toBe(true);
  });

  it('marks the sections hideable and the Friends pages gated', () => {
    const hideable = NAV_ITEMS.filter((i) => i.hideable).map((i) => i.hideable);
    expect([...hideable].sort()).toEqual([...HIDEABLE_SECTIONS].sort());
    expect(NAV_ITEMS.filter((i) => i.gate).map((i) => [i.id, i.gate])).toEqual([
      ['feed', 'feed'],
      ['compare', 'compare'],
      ['together', 'compare'],
    ]);
  });

  for (const layout of LAYOUT_IDS) {
    describe(layout, () => {
      for (const [name, opts] of OPTION_CASES) {
        it(`reaches every permitted page exactly once (${name})`, () => {
          const model = navFor(layout, opts);
          const got = ids(model);
          expect(new Set(got).size).toBe(got.length);
          expect([...got].sort()).toEqual(permitted(opts).sort());
        });

        it(`always ends the menu with Settings and Log out (${name})`, () => {
          const model = navFor(layout, opts);
          const last = model.menu.at(-1)!;
          const tail = last.entries.slice(-2);
          expect(tail).toEqual([
            { kind: 'link', link: expect.objectContaining({ id: 'settings', href: '/settings' }) },
            { kind: 'action', action: 'logout' },
          ]);
          expect(menuLinkIds(model)).toContain('settings');
          expect(actions(model)).toContain('logout');
        });

        it(`keeps notifications, search and the palette in the menu, theme unless forced dark (${name})`, () => {
          const model = navFor(layout, opts);
          expect(model.menu[0].entries).toEqual([
            { kind: 'action', action: 'notifications' },
            { kind: 'action', action: 'search' },
            { kind: 'action', action: 'palette' },
          ]);
          expect(actions(model).includes('theme')).toBe(!LAYOUTS[layout].forceDark);
          expect(model.menu.every((s) => s.entries.length > 0)).toBe(true);
          expect(model.primary.every((g) => g.links.length > 0)).toBe(true);
        });
      }

      it('respects the gates', () => {
        const none = ids(navFor(layout, { social: NO_SOCIAL }));
        expect(none).not.toContain('feed');
        expect(none).not.toContain('compare');
        expect(none).not.toContain('together');
        const compare = ids(navFor(layout, { social: { compare: true, feed: false } }));
        expect(compare).toEqual(expect.arrayContaining(['compare', 'together']));
        expect(compare).not.toContain('feed');
        const feed = ids(navFor(layout, { social: { compare: false, feed: true } }));
        expect(feed).toContain('feed');
        expect(feed).not.toContain('compare');
      });

      it('leaves hidden sections out everywhere, but never the dashboard', () => {
        const got = ids(navFor(layout, { hidden: ['books', 'franchises'], social: ALL_SOCIAL }));
        expect(got).not.toContain('books');
        expect(got).not.toContain('franchises');
        expect(got).toContain('movies');
        expect(ids(navFor(layout, { hidden: [...HIDEABLE_SECTIONS] }))).toContain('dashboard');
      });

      it('puts saved views under Views, wherever Views is', () => {
        const model = navFor(layout, { savedViews: VIEWS });
        const views = allLinks(model).find((x) => x.link.id === 'views')!.link;
        expect(views.children).toEqual([
          { id: 'view:v1', label: 'Sci-fi favourites', href: '/views?view=v1', icon: 'Filter' },
          { id: 'view:v2', label: 'Comfort rewatches', href: '/views?view=v2', icon: 'Filter' },
        ]);
        expect(allLinks(navFor(layout, {})).find((x) => x.link.id === 'views')!.link.children).toBeUndefined();
      });

      it('never puts Settings outside the menu', () => {
        expect(PLACEMENT[layout].primary).not.toContain('settings');
        expect(PLACEMENT[layout].top).not.toContain('settings');
      });
    });
  }

  describe('placement (the plan table)', () => {
    const full: NavOptions = { social: ALL_SOCIAL, savedViews: VIEWS };

    it('Classic: Dashboard, Franchises and the 7 sections in the sidebar; everything else in the menu', () => {
      const m = navFor('classic', full);
      expect(m.primary).toHaveLength(1);
      expect(m.primary[0].label).toBeNull();
      expect(primaryIds(m)).toEqual(['dashboard', 'franchises', ...NAV_ORDER]);
      expect(m.top).toEqual([]);
      expect(menuLinkIds(m)).toEqual([
        'tonight',
        'calendar',
        'diary',
        'stats',
        'lists',
        'tags',
        'views',
        'feed',
        'compare',
        'together',
        'import',
        'settings',
      ]);
    });

    it('Minimal: the 7 sections in the sidebar, Dashboard up top', () => {
      const m = navFor('minimal', full);
      expect(primaryIds(m)).toEqual([...NAV_ORDER]);
      expect(m.top.map((l) => l.id)).toEqual(['dashboard']);
      expect(menuLinkIds(m)[0]).toBe('franchises');
      expect(menuLinkIds(m)).not.toContain('dashboard');
    });

    it('Organised: a grouped sidebar, Import and Settings in the menu', () => {
      const m = navFor('organised', full);
      expect(m.primary.map((g) => [g.label, g.links.map((l) => l.id)])).toEqual([
        ['Library', ['dashboard', 'franchises', ...NAV_ORDER]],
        ['Plan & track', ['tonight', 'calendar', 'diary']],
        ['Organise', ['lists', 'tags', 'views']],
        ['Insights', ['stats']],
        ['Friends', ['feed', 'compare', 'together']],
      ]);
      expect(m.top).toEqual([]);
      expect(menuLinkIds(m)).toEqual(['import', 'settings']);
      // Without the opt-ins the Friends group goes.
      expect(navFor('organised', {}).primary.map((g) => g.label)).not.toContain('Friends');
    });

    it('Fresh: tabs of Home and the 7 sections, no sidebar groups, the rest in the menu', () => {
      const m = navFor('fresh', full);
      expect(m.primary).toHaveLength(1);
      expect(m.primary[0].links.map((l) => [l.id, l.label])).toEqual([
        ['dashboard', 'Home'],
        ...NAV_ORDER.map((slug) => [slug, CATEGORIES[slug].label]),
      ]);
      expect(m.top).toEqual([]);
      expect(menuLinkIds(m)[0]).toBe('franchises');
      expect(actions(m)).not.toContain('theme');
    });

    it('groups the menu with Import beside Theme, Settings and Log out', () => {
      const m = navFor('classic', full);
      expect(m.menu.map((s) => s.id)).toEqual(['find', 'track', 'organise', 'friends', 'account']);
      expect(m.menu.at(-1)!.entries.map((e) => (e.kind === 'link' ? e.link.id : e.action))).toEqual([
        'import',
        'theme',
        'settings',
        'logout',
      ]);
      expect(navFor('fresh', full).menu.at(-1)!.entries.map((e) => (e.kind === 'link' ? e.link.id : e.action))).toEqual([
        'import',
        'settings',
        'logout',
      ]);
    });
  });

  it('ignores junk in the hidden list', () => {
    const m = navFor('classic' as LayoutId, { hidden: ['toString', '__proto__', 'nope'] });
    expect(primaryIds(m)).toEqual(['dashboard', 'franchises', ...NAV_ORDER]);
  });

  describe('isNavLinkActive', () => {
    const link = (id: string, href: string): NavLink => ({ id, label: id, href, icon: 'Boxes' });

    it('matches the page and the pages under it', () => {
      expect(isNavLinkActive(link('books', '/books'), '/books', null)).toBe(true);
      expect(isNavLinkActive(link('books', '/books'), '/books/arena', null)).toBe(true);
      expect(isNavLinkActive(link('books', '/books'), '/bookshelf', null)).toBe(false);
      expect(isNavLinkActive(link('dashboard', '/dashboard'), '/books', null)).toBe(false);
    });

    it('tells Views from a saved view', () => {
      const views = link('views', '/views');
      const v1 = link('view:v1', '/views?view=v1');
      expect(isNavLinkActive(views, '/views', null)).toBe(true);
      expect(isNavLinkActive(views, '/views', 'v1')).toBe(false);
      expect(isNavLinkActive(v1, '/views', 'v1')).toBe(true);
      expect(isNavLinkActive(v1, '/views', 'v2')).toBe(false);
      expect(isNavLinkActive(v1, '/views', null)).toBe(false);
    });
  });

  it('gives the palette every permitted page (no saved views)', () => {
    expect(paletteLinks({ social: ALL_SOCIAL }).map((l) => l.id)).toEqual(NAV_ITEMS.map((i) => i.id));
    const some = paletteLinks({ hidden: ['games'], social: { compare: false, feed: true } }).map((l) => l.id);
    expect(some).not.toContain('games');
    expect(some).not.toContain('compare');
    expect(some).toContain('feed');
  });
});
