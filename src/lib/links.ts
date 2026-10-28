// ───────────────────────────────────────────────────────────────────────────
//  Add by link (spec 2.4): recognise a shared or pasted link. Pure and
//  client-safe; the lookups live in src/lib/link-resolve.ts.
//
//  `parseMediaUrl` maps a URL to the provider and id it names (TMDB, IMDb,
//  AniList, MyAnimeList, IGDB, Steam, Goodreads, Letterboxd, OpenLibrary), or
//  null for anything else — those get their page <title> read instead.
//  `findUrl` digs the link out of share-sheet text ("Look at this https://…").
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';

export type LinkProvider =
  | 'tmdb'
  | 'imdb'
  | 'anilist'
  | 'mal'
  | 'igdb'
  | 'steam'
  | 'goodreads'
  | 'letterboxd'
  | 'openlibrary';

export interface ParsedLink {
  provider: LinkProvider;
  /**
   * The provider's id: a TMDB / AniList / MAL / Steam / Goodreads number, an
   * IMDb `tt…` id, an IGDB or Letterboxd slug, or an OpenLibrary key
   * (`/works/OL…W` or `/books/OL…M`).
   */
  id: string;
  category?: CategorySlug;
  /** A title guess from the URL's slug (Goodreads, Letterboxd, IGDB, Steam). */
  hint?: string;
}

/** A host without `www.` / `m.` and a trailing dot, lower-case. */
function bareHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^(www|m)\./, '');
}

/** "the-matrix_reloaded" → "the matrix reloaded" (URL-decoded, trimmed). */
export function slugWords(slug: string): string {
  let s = slug;
  try {
    s = decodeURIComponent(slug);
  } catch {
    // Keep the raw slug.
  }
  return s.replace(/[-_+.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A Letterboxd film slug as a search: "dune-2021" → {query "dune", year
 * 2021}. Letterboxd only appends a year to tell same-named films apart, so
 * a trailing 18xx–20xx is taken as the year when something precedes it.
 */
export function letterboxdQuery(slug: string): { query: string; year?: number } {
  const words = slugWords(slug);
  const m = /^(.+?)\s+((?:18|19|20)\d{2})$/.exec(words);
  return m ? { query: m[1], year: Number(m[2]) } : { query: words };
}

/**
 * The provider and id a media link names, or null. Accepts the common
 * shapes of each site (with or without `www.` / `m.`, trailing path pieces,
 * queries and fragments).
 */
export function parseMediaUrl(raw: string): ParsedLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = bareHost(url);
  const parts = url.pathname.split('/').filter(Boolean);
  const [a, b, c] = parts;

  switch (host) {
    case 'themoviedb.org': {
      // /movie/603-the-matrix, /tv/1396-breaking-bad/season/1, /en/movie/603?
      const i = parts.findIndex((p) => p === 'movie' || p === 'tv');
      const id = i >= 0 ? /^(\d+)/.exec(parts[i + 1] ?? '')?.[1] : undefined;
      if (!id) return null;
      return { provider: 'tmdb', id, category: parts[i] === 'movie' ? 'movies' : 'tv' };
    }
    case 'imdb.com': {
      // /title/tt0133093/, /title/tt0133093/reference, /de/title/tt…
      const i = parts.indexOf('title');
      const id = i >= 0 ? /^(tt\d{5,10})$/i.exec(parts[i + 1] ?? '')?.[1] : undefined;
      return id ? { provider: 'imdb', id: id.toLowerCase() } : null;
    }
    case 'anilist.co':
    case 'myanimelist.net': {
      // /anime/1/Cowboy-Bebop/, /manga/30013/One_Piece
      if ((a !== 'anime' && a !== 'manga') || !/^\d+$/.test(b ?? '')) return null;
      return { provider: host === 'anilist.co' ? 'anilist' : 'mal', id: b, category: a };
    }
    case 'igdb.com': {
      // /games/the-witcher-3-wild-hunt
      if (a !== 'games' || !b || !/^[a-z0-9-]+$/i.test(b)) return null;
      return { provider: 'igdb', id: b.toLowerCase(), category: 'games', hint: slugWords(b) };
    }
    case 'store.steampowered.com':
    case 'steamcommunity.com': {
      // store: /app/570/Dota_2/ · community: /app/570
      if (a !== 'app' || !/^\d+$/.test(b ?? '')) return null;
      return { provider: 'steam', id: b, category: 'games', ...(c && { hint: slugWords(c) }) };
    }
    case 'goodreads.com': {
      // /book/show/44767458-dune, /book/show/234225.Dune, /en/book/show/…
      const i = parts.indexOf('book');
      if (i < 0 || parts[i + 1] !== 'show') return null;
      const m = /^(\d+)(?:[-.](.+))?$/.exec(parts[i + 2] ?? '');
      if (!m) return null;
      return { provider: 'goodreads', id: m[1], category: 'books', ...(m[2] && { hint: slugWords(m[2]) }) };
    }
    case 'letterboxd.com': {
      // /film/the-matrix/, /film/dune-2021/reviews/, /someone/film/the-matrix/
      const i = parts.indexOf('film');
      const slug = i >= 0 ? parts[i + 1] : undefined;
      if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return null;
      return { provider: 'letterboxd', id: slug.toLowerCase(), category: 'movies', hint: letterboxdQuery(slug).query };
    }
    case 'openlibrary.org': {
      // /works/OL45804W/Dune, /books/OL7353617M/Dune
      if (a === 'works' && /^OL\d+W$/i.test(b ?? '')) {
        return { provider: 'openlibrary', id: `/works/${b.toUpperCase()}`, category: 'books' };
      }
      if (a === 'books' && /^OL\d+M$/i.test(b ?? '')) {
        return { provider: 'openlibrary', id: `/books/${b.toUpperCase()}`, category: 'books' };
      }
      return null;
    }
    default:
      // boxd.it short links and everything else: read the page's <title>.
      return null;
  }
}

/**
 * The first http(s) URL in share-sheet text, trailing punctuation trimmed;
 * null when there is none.
 */
export function findUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (!m) return null;
  let u = m[0].replace(/[.,;:!?)\]}»”’]+$/, '');
  // Keep a closing parenthesis that belongs to the URL (Wikipedia-style).
  if (m[0].length > u.length && m[0][u.length] === ')' && u.includes('(')) u += ')';
  return u;
}

/**
 * What the /add page was handed (share target or ?url=): the link to resolve
 * and the best title guess for the fallback search. Android puts the link in
 * `text` (with other words) as often as in `url`.
 */
export function sharedInput(p: { url?: string; text?: string; title?: string }): {
  url: string | null;
  guess: string;
} {
  const url = (p.url && findUrl(p.url)) || (p.text && findUrl(p.text)) || null;
  const textRest = (p.text ?? '').replace(/https?:\/\/[^\s<>"']+/gi, ' ').replace(/\s+/g, ' ').trim();
  const guess = (p.title ?? '').trim() || textRest || (url ? parseMediaUrl(url)?.hint ?? '' : '');
  return { url, guess: guess.slice(0, 200) };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (all, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k];
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
    if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)) || 32);
    return all;
  });
}

/** A meta tag's content (property= or name=), attribute order free. */
function metaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  const tag = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${esc}["'][^>]*>`, 'i').exec(html)?.[0];
  const content = tag ? /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag) : null;
  const v = content ? content[1] ?? content[2] : null;
  return v ? decodeEntities(v).trim() || null : null;
}

/**
 * A page's title for the fallback search: og:title, else <title>, with a
 * trailing " | Site" / " - Site" / " · Site" suffix dropped. Null when none.
 */
export function pageTitle(html: string): string | null {
  const raw =
    metaContent(html, 'og:title') ??
    (() => {
      const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() || null : null;
    })();
  if (!raw) return null;
  const cut = raw.replace(/\s+[|·–—-]\s+[^|·–—-]{1,40}$/, '').trim();
  return (cut || raw).slice(0, 200);
}

/** An ISBN-10/13 from a book page (meta books:isbn, then page JSON), or null. */
export function isbnFromHtml(html: string): string | null {
  const clean = (v: string | null | undefined) => {
    const s = (v ?? '').replace(/[\s-]/g, '').toUpperCase();
    return /^(\d{13}|\d{9}[\dX])$/.test(s) ? s : null;
  };
  const meta = clean(metaContent(html, 'books:isbn'));
  if (meta) return meta;
  for (const re of [/"isbn13"\s*:\s*"([\dX-]+)"/i, /"isbn"\s*:\s*"([\dX-]+)"/i]) {
    const found = clean(re.exec(html)?.[1]);
    if (found) return found;
  }
  return null;
}
