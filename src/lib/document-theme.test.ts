import { describe, expect, it } from 'vitest';

import {
  THEME_COLORS,
  THEME_STORAGE_KEY,
  resolveDocumentTheme,
  themeBootstrapScript,
  themeColorFor,
} from './document-theme';
import { LAYOUT_IDS } from './layouts';

describe('resolveDocumentTheme', () => {
  it('follows the stored theme, then the OS, outside Fresh', () => {
    for (const layout of ['classic', 'minimal', 'organised'] as const) {
      expect(resolveDocumentTheme(layout, 'dark', false)).toEqual({ layout, dark: true });
      expect(resolveDocumentTheme(layout, 'light', true)).toEqual({ layout, dark: false });
      expect(resolveDocumentTheme(layout, null, true)).toEqual({ layout, dark: true });
      expect(resolveDocumentTheme(layout, null, false)).toEqual({ layout, dark: false });
    }
  });

  it('forces dark in Fresh whatever the stored theme or the OS say', () => {
    for (const stored of [null, 'light', 'dark']) {
      for (const os of [true, false]) {
        expect(resolveDocumentTheme('fresh', stored, os)).toEqual({ layout: 'fresh', dark: true });
      }
    }
  });

  it('treats an unknown layout as Classic', () => {
    expect(resolveDocumentTheme('neon', 'light', true)).toEqual({ layout: 'classic', dark: false });
    expect(resolveDocumentTheme(null, null, true)).toEqual({ layout: 'classic', dark: true });
  });
});

/** Runs the inline bootstrap against a fake <html>, storage and matchMedia. */
function runBootstrap({
  layout,
  stored,
  prefersDark,
  storageThrows = false,
}: {
  layout: string | null;
  stored: string | null;
  prefersDark: boolean;
  storageThrows?: boolean;
}): boolean {
  const classes = new Set<string>();
  const documentElement = {
    getAttribute: (name: string) => (name === 'data-layout' ? layout : null),
    classList: { add: (c: string) => classes.add(c) },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('blocked');
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const window = { matchMedia: (q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && prefersDark }) };
  new Function('document', 'localStorage', 'window', themeBootstrapScript())({ documentElement }, localStorage, window);
  return classes.has('dark');
}

describe('themeBootstrapScript', () => {
  it('agrees with resolveDocumentTheme for every layout, stored theme and OS preference', () => {
    for (const layout of [...LAYOUT_IDS, null, 'neon']) {
      for (const stored of [null, '', 'light', 'dark', 'garbage']) {
        for (const prefersDark of [true, false]) {
          expect(runBootstrap({ layout, stored, prefersDark }), `${layout} ${stored} ${prefersDark}`).toBe(
            resolveDocumentTheme(layout, stored, prefersDark).dark,
          );
        }
      }
    }
  });

  it('still forces Fresh dark when storage is blocked', () => {
    expect(runBootstrap({ layout: 'fresh', stored: 'light', prefersDark: false, storageThrows: true })).toBe(true);
    expect(runBootstrap({ layout: 'classic', stored: 'dark', prefersDark: false, storageThrows: true })).toBe(false);
    expect(runBootstrap({ layout: 'classic', stored: 'dark', prefersDark: true, storageThrows: true })).toBe(true);
  });

  it('only ever adds the class (never writes the stored theme)', () => {
    const script = themeBootstrapScript();
    expect(script).not.toMatch(/setItem|removeItem|className\s*=/);
  });
});

describe('themeColorFor', () => {
  const light = '(prefers-color-scheme: light)';
  const dark = '(prefers-color-scheme: dark)';

  it('uses Fresh\'s background on every tag while a layout forces dark', () => {
    for (const media of [light, dark, null]) {
      expect(themeColorFor(media, { layout: 'fresh', dark: true })).toBe(THEME_COLORS.forcedDark);
    }
  });

  it('keeps the light / dark pair outside a forced layout', () => {
    for (const isDark of [true, false]) {
      expect(themeColorFor(light, { layout: 'classic', dark: isDark })).toBe(THEME_COLORS.light);
      expect(themeColorFor(dark, { layout: 'minimal', dark: isDark })).toBe(THEME_COLORS.dark);
    }
  });

  it('makes a single tag (left from Fresh) follow the document', () => {
    expect(themeColorFor(null, { layout: 'classic', dark: true })).toBe(THEME_COLORS.dark);
    expect(themeColorFor(null, { layout: 'organised', dark: false })).toBe(THEME_COLORS.light);
  });
});
