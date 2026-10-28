// The app's public base URL (spec G5), used for links that leave the app:
// notification click-throughs, share and iCal links, OAuth redirects.
const DEFAULT_PUBLIC_URL = 'https://hoard.timhufnagel.org';

export function publicBaseUrl(): string {
  return (process.env.HOARD_PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/+$/, '');
}

/** An absolute URL for an in-app path ("/settings"); absolute URLs pass through. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${publicBaseUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}
