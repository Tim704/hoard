import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DEFAULT_DISPLAY_PREFS } from './display-prefs';
import { DEFAULT_LAYOUT, LAYOUT_IDS, LAYOUTS, isLayoutId, resolveLayout } from './layouts';

describe('layouts', () => {
  it('has one complete config per id', () => {
    expect(Object.keys(LAYOUTS).sort()).toEqual([...LAYOUT_IDS].sort());
    for (const id of LAYOUT_IDS) {
      const l = LAYOUTS[id];
      expect(l.id).toBe(id);
      expect(l.label.length).toBeGreaterThan(0);
      expect(l.description.length).toBeGreaterThan(0);
      expect(l.gridCols).toMatch(/^grid grid-cols-\d/);
    }
  });

  it('gives each layout its own navigation and card style', () => {
    expect(new Set(LAYOUT_IDS.map((id) => LAYOUTS[id].nav)).size).toBe(LAYOUT_IDS.length);
    expect(new Set(LAYOUT_IDS.map((id) => LAYOUTS[id].card)).size).toBe(LAYOUT_IDS.length);
  });

  it('keeps Classic as the pre-layouts look and the default', () => {
    expect(DEFAULT_LAYOUT).toBe('classic');
    expect(DEFAULT_DISPLAY_PREFS.layout).toBe('classic');
    expect(LAYOUTS.classic).toMatchObject({ nav: 'sidebar-flat', card: 'plain', toolbar: 'labelled', forceDark: false });
    // MediaGrid's columns before layouts (its gap is --grid-gap, below).
    expect(LAYOUTS.classic.gridCols).toBe(
      'grid grid-cols-2 gap-[var(--grid-gap)] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
    );
  });

  it('spaces cards with --grid-gap alone: one source for the gap', () => {
    for (const id of LAYOUT_IDS) {
      const gaps = LAYOUTS[id].gridCols.split(' ').filter((c) => /(^|:)gap-/.test(c));
      expect(gaps).toEqual(['gap-[var(--grid-gap)]']);
    }
  });

  it("keeps Classic's old gap (gap-3, sm:gap-4) in --grid-gap", () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    expect(css).toMatch(/ {2}:root \{[^}]*--grid-gap: 0\.75rem;/);
    expect(css).toMatch(/@media \(min-width: 640px\) \{\s*:root \{[^}]*--grid-gap: 1rem;/);
  });

  it('matches the plan for the other three', () => {
    expect(LAYOUTS.minimal).toMatchObject({ nav: 'sidebar-sections+topbar', card: 'poster', toolbar: 'icons' });
    expect(LAYOUTS.organised).toMatchObject({ nav: 'sidebar-grouped', card: 'one-badge', toolbar: 'icons' });
    expect(LAYOUTS.fresh).toMatchObject({ nav: 'topbar-tabs', card: 'cinematic', toolbar: 'icons' });
  });

  it('forces dark mode in Fresh only', () => {
    expect(LAYOUT_IDS.filter((id) => LAYOUTS[id].forceDark)).toEqual(['fresh']);
  });

  it('falls back to Classic for anything unknown', () => {
    for (const id of LAYOUT_IDS) expect(resolveLayout(id)).toBe(id);
    for (const bad of [undefined, null, '', 'Fresh', 'neon', 42, {}, ['fresh'], 'toString', '__proto__']) {
      expect(resolveLayout(bad)).toBe('classic');
      expect(isLayoutId(bad)).toBe(false);
    }
  });
});
