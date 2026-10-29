// ───────────────────────────────────────────────────────────────────────────
//  What <html> carries: `data-layout` (server-rendered from the user's prefs
//  by src/app/layout.tsx) and the `dark` class (owned by the client: the
//  pre-paint bootstrap script, ThemeToggle and the instant layout switch).
//  React never renders a className on <html>, so nothing wipes `dark`.
//
//  dark = the layout forces it (Fresh) || the stored `hoard-theme` is "dark"
//         || (no stored theme && the OS prefers dark).
//  A forced layout never writes `hoard-theme`, so leaving Fresh brings back
//  the user's own choice.
// ───────────────────────────────────────────────────────────────────────────

import { LAYOUT_IDS, LAYOUTS, resolveLayout, type LayoutId } from '@/lib/layouts';

/** localStorage key of the light/dark choice (ThemeToggle). */
export const THEME_STORAGE_KEY = 'hoard-theme';

/**
 * Browser chrome colours (<meta name="theme-color">): the light and dark
 * backgrounds, and Fresh's while a layout forces dark (globals.css).
 */
export const THEME_COLORS = { light: '#f9f9fb', dark: '#09090b', forcedDark: '#09090c' } as const;
const PREFERS_DARK = '(prefers-color-scheme: dark)';

/** The document state for a layout, the stored theme and the OS preference. */
export function resolveDocumentTheme(
  layout: unknown,
  storedTheme: string | null,
  prefersDark: boolean,
): { layout: LayoutId; dark: boolean } {
  const id = resolveLayout(layout);
  const dark = LAYOUTS[id].forceDark || (storedTheme ? storedTheme === 'dark' : prefersDark);
  return { layout: id, dark };
}

/**
 * The colour for one theme-color meta tag. Outside a forced layout the root
 * layout renders a light / dark pair keyed by `media`, which stays as it is;
 * a tag without `media` (rendered while a layout forced dark) follows the
 * document instead.
 */
export function themeColorFor(media: string | null, theme: { layout: LayoutId; dark: boolean }): string {
  if (LAYOUTS[theme.layout].forceDark) return THEME_COLORS.forcedDark;
  if (media) return media.includes(PREFERS_DARK) ? THEME_COLORS.dark : THEME_COLORS.light;
  return theme.dark ? THEME_COLORS.dark : THEME_COLORS.light;
}

/**
 * The no-flash bootstrap, inlined in <head> so it runs before the first paint.
 * It reads `data-layout` from <html> and must agree with resolveDocumentTheme
 * (pinned by document-theme.test.ts, which runs this exact string).
 */
export function themeBootstrapScript(): string {
  const forced = JSON.stringify(LAYOUT_IDS.filter((id) => LAYOUTS[id].forceDark));
  const key = JSON.stringify(THEME_STORAGE_KEY);
  return (
    '(function(){var d=document.documentElement,t=null,m=false;' +
    `try{t=localStorage.getItem(${key})}catch(e){}` +
    "try{m=window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){}" +
    `if(${forced}.indexOf(d.getAttribute('data-layout'))>=0||(t?t==='dark':m))d.classList.add('dark')})();`
  );
}

/**
 * Client only: switch <html> to a layout straight away (the instant switch,
 * its rollback, a login or logout), recomputing `dark` from the stored theme
 * and the OS, and the theme-color tags with it.
 */
export function applyLayoutToDocument(layout: LayoutId): void {
  if (typeof document === 'undefined') return;
  let stored: string | null = null;
  let prefersDark = false;
  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode…): fall back to the OS preference.
  }
  try {
    prefersDark = window.matchMedia(PREFERS_DARK).matches;
  } catch {
    // No matchMedia: light.
  }
  const next = resolveDocumentTheme(layout, stored, prefersDark);
  const root = document.documentElement;
  root.dataset.layout = next.layout;
  root.classList.toggle('dark', next.dark);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const color = themeColorFor(meta.getAttribute('media'), next);
    if (meta.content !== color) meta.content = color;
  }
}
