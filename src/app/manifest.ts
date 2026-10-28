import type { MetadataRoute } from 'next';

// The web app manifest (spec 1.7): installable from the browser, opening on
// the dashboard. Android's share sheet sends links and text to /add (2.4).
// No service worker on purpose — offline caching could serve stale server
// actions, and installing doesn't need one. Icons: scripts/generate-icons.mjs.

/** The dark theme's background (globals.css `.dark --background`). */
const DARK_BACKGROUND = '#09090b';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hoard',
    short_name: 'Hoard',
    description: 'Everything you mean to watch, read, play and listen to.',
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    theme_color: DARK_BACKGROUND,
    background_color: DARK_BACKGROUND,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Next 14's manifest type models share_target wrongly (params as a list),
    // so it is added untyped in the shape the Web Share Target spec defines.
    ...({
      share_target: {
        action: '/add',
        method: 'GET',
        params: { title: 'title', text: 'text', url: 'url' },
      },
    } as Record<string, unknown>),
  };
}
