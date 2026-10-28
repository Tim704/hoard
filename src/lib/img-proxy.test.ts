import { describe, expect, it } from 'vitest';

import { allowedImageUrl, isAllowedImageHost, isAllowedImageType, proxiedImageUrl } from './img-proxy';

describe('allowedImageUrl', () => {
  it.each([
    'https://image.tmdb.org/t/p/w500/abc.jpg',
    'https://covers.openlibrary.org/b/id/6979861-L.jpg',
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-x.png',
    'https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg',
    'https://lastfm.freetls.fastly.net/i/u/300x300/a.png',
    'https://archive.org/download/olcovers697/olcovers697-L.zip/6979861-L.jpg',
    'https://ia801505.us.archive.org/view_archive.php?archive=/8/items/x.zip&file=1-L.jpg',
    'https://IMAGE.TMDB.ORG/t/p/w500/abc.jpg',
    'https://image.tmdb.org:443/t/p/w500/abc.jpg',
  ])('allows %s', (u) => {
    expect(allowedImageUrl(u)).not.toBeNull();
  });

  it.each([
    ['http, not https', 'http://image.tmdb.org/t/p/w500/abc.jpg'],
    ['an unknown host', 'https://evil.example/x.jpg'],
    ['a look-alike suffix', 'https://image.tmdb.org.evil.example/x.jpg'],
    ['a look-alike prefix', 'https://evilimage.tmdb.org/x.jpg'],
    ['a subdomain of an allowed host', 'https://x.image.tmdb.org/x.jpg'],
    ['credentials', 'https://user:pw@image.tmdb.org/x.jpg'],
    ['another port', 'https://image.tmdb.org:8443/x.jpg'],
    ['an archive host that is not a storage node', 'https://web.archive.org/x.jpg'],
    ['an IP literal', 'https://127.0.0.1/x.jpg'],
    ['a data URL', 'data:image/png;base64,AAAA'],
    ['garbage', 'not a url'],
    ['empty', ''],
  ])('refuses %s', (_why, u) => {
    expect(allowedImageUrl(u)).toBeNull();
  });

  it('refuses non-strings and absurdly long URLs', () => {
    expect(allowedImageUrl(null)).toBeNull();
    expect(allowedImageUrl(undefined)).toBeNull();
    expect(allowedImageUrl(`https://image.tmdb.org/${'a'.repeat(3000)}`)).toBeNull();
  });
});

describe('isAllowedImageHost', () => {
  it('matches exact hosts and archive storage nodes only', () => {
    expect(isAllowedImageHost('s4.anilist.co')).toBe(true);
    expect(isAllowedImageHost('ia800100.us.archive.org')).toBe(true);
    expect(isAllowedImageHost('iax.us.archive.org')).toBe(false);
    expect(isAllowedImageHost('ia1.us.archive.org.evil.example')).toBe(false);
    expect(isAllowedImageHost('anilist.co')).toBe(false);
  });
});

describe('isAllowedImageType', () => {
  it('accepts raster images, refuses SVG and everything else', () => {
    expect(isAllowedImageType('image/jpeg')).toBe(true);
    expect(isAllowedImageType('image/png; charset=binary')).toBe(true);
    expect(isAllowedImageType('IMAGE/WEBP')).toBe(true);
    expect(isAllowedImageType('image/svg+xml')).toBe(false);
    expect(isAllowedImageType('text/html')).toBe(false);
    expect(isAllowedImageType(null)).toBe(false);
  });
});

describe('proxiedImageUrl', () => {
  it('builds a same-origin URL for allowed covers only', () => {
    expect(proxiedImageUrl('https://image.tmdb.org/t/p/w500/a b.jpg')).toBe(
      '/api/img?u=' + encodeURIComponent('https://image.tmdb.org/t/p/w500/a%20b.jpg'),
    );
    expect(proxiedImageUrl('https://evil.example/x.jpg')).toBeNull();
    expect(proxiedImageUrl(null)).toBeNull();
  });
});
