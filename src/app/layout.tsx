import './globals.css';

import type { Metadata, Viewport } from 'next';
import { Manrope, Outfit } from 'next/font/google';
import { cookies } from 'next/headers';

import { Toaster } from '@/components/ui/sonner';
import { getPrefs } from '@/lib/data-prefs';
import { themeBootstrapScript } from '@/lib/document-theme';
import { DEFAULT_LAYOUT, LAYOUTS, type LayoutId } from '@/lib/layouts';
import { SESSION_COOKIE, getCurrentUser } from '@/lib/session';
import { cn } from '@/lib/utils';

// Classic uses the system sans stack (Tailwind's `font-sans`). These are the
// display fonts of the Minimal and Fresh layouts (globals.css switches to
// them under [data-layout]). Not preloaded: a browser only downloads one
// when a layout that uses it is on.
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
  preload: false,
});
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  preload: false,
});

/**
 * The signed-in user's layout, for `data-layout` on <html> (Classic when
 * signed out, or when the prefs can't be read). Shares the per-request
 * getCurrentUser / getPrefs with the (app) layout.
 */
async function currentLayout(): Promise<LayoutId> {
  // Outside the try: reading cookies is what makes every page dynamic.
  if (!cookies().has(SESSION_COOKIE)) return DEFAULT_LAYOUT;
  try {
    const user = await getCurrentUser();
    return user ? (await getPrefs(user.id)).layout : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const THEME_BOOTSTRAP = themeBootstrapScript();

/** Fresh's background (globals.css), for the browser chrome while it forces dark. */
const FORCED_DARK_THEME_COLOR = '#09090c';

export const metadata: Metadata = {
  title: 'Hoard — Media Tracker',
  description:
    'Hoard everything you mean to watch, read, play and listen to — across seven domains.',
  // Installed to an iPhone home screen: full screen, titled "Hoard". The
  // manifest (src/app/manifest.ts) covers everything else; the icons are the
  // file conventions src/app/icon.svg and src/app/apple-icon.png (setting
  // `icons` here would replace them).
  applicationName: 'Hoard',
  appleWebApp: { capable: true, title: 'Hoard', statusBarStyle: 'black-translucent' },
};

// `viewport-fit=cover` lets the mobile chrome (top bar, drawer, bottom sheets)
// extend behind notches; those surfaces pad with env(safe-area-inset-*).
export async function generateViewport(): Promise<Viewport> {
  const forcedDark = LAYOUTS[await currentLayout()].forceDark;
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    // Browser chrome follows the page: light background in light mode, the
    // dark theme's background otherwise (always dark in Fresh).
    themeColor: forcedDark
      ? FORCED_DARK_THEME_COLOR
      : [
          { media: '(prefers-color-scheme: light)', color: '#f9f9fb' },
          { media: '(prefers-color-scheme: dark)', color: '#09090b' },
        ],
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const layout = await currentLayout();
  // Never a className on <html>: React would wipe the `dark` class the
  // bootstrap below adds (src/lib/document-theme.ts).
  return (
    <html lang="en" data-layout={layout} suppressHydrationWarning>
      <head>
        {/*
          No-FOUC theme bootstrap: runs before paint to apply the saved theme
          (or the OS preference when unset; always dark in Fresh), so there's
          no light→dark flash. Generated from src/lib/document-theme.ts.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          manrope.variable,
          outfit.variable,
        )}
      >
        {children}
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
