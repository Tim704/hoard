// ───────────────────────────────────────────────────────────────────────────
//  The cover image proxy's policy (spec 4.1). Pure and client-safe.
//
//  The tier list PNG is drawn on a canvas, which only accepts cross-origin
//  images that send CORS headers — most provider CDNs don't. So the export
//  loads covers through the same-origin route /api/img?u=<url>, which fetches
//  ONLY from the CDNs our provider mappers actually store (src/lib/apis/*):
//  exact host names, https on the default port, no credentials. Open Library
//  covers redirect to the Internet Archive (archive.org, then an
//  ia<N>.us.archive.org storage node), so those hosts are allowed as redirect
//  hops too — every hop is checked again by the route.
// ───────────────────────────────────────────────────────────────────────────

/** Hosts whose images the mappers store (TMDB, Open Library, AniList, IGDB, Last.fm). */
export const IMAGE_HOSTS: ReadonlySet<string> = new Set([
  'image.tmdb.org',
  'covers.openlibrary.org',
  's4.anilist.co',
  'images.igdb.com',
  'lastfm.freetls.fastly.net',
  // Open Library's cover redirects (see above). Deliberately the whole hosts:
  // their cover paths (/download/olcovers…, /view_archive.php?…) vary, and the
  // risk is bounded — only raster images under 5 MB pass, for signed-in users,
  // as a same-origin copy of a public file (no cookies are forwarded).
  'archive.org',
]);

/** Open Library cover storage nodes: ia800100.us.archive.org and the like. */
const ARCHIVE_NODE = /^ia\d{1,6}\.us\.archive\.org$/;

export const IMG_MAX_BYTES = 5 * 1024 * 1024;
export const IMG_TIMEOUT_MS = 8000;
export const IMG_MAX_REDIRECTS = 3;

/** Raster types only: an SVG served from our origin could carry script. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

export function isAllowedImageHost(host: string): boolean {
  const h = host.toLowerCase();
  return IMAGE_HOSTS.has(h) || ARCHIVE_NODE.test(h);
}

/** The URL to fetch, or null when the proxy must refuse it. */
export function allowedImageUrl(raw: string | null | undefined): URL | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  return isAllowedImageHost(url.hostname) ? url : null;
}

/** Whether a response's content type is one the proxy passes on (e.g. "image/jpeg; charset=…"). */
export function isAllowedImageType(contentType: string | null): boolean {
  if (!contentType) return false;
  return IMAGE_TYPES.has(contentType.split(';')[0].trim().toLowerCase());
}

/** The same-origin proxy URL for a cover, or null when it isn't proxyable. */
export function proxiedImageUrl(raw: string | null | undefined): string | null {
  const url = allowedImageUrl(raw);
  return url ? `/api/img?u=${encodeURIComponent(url.toString())}` : null;
}
