// ───────────────────────────────────────────────────────────────────────────
//  Add by link (spec 2.4), the lookups: a recognised link → the provider's
//  title as a search-shaped hit; anything else → the page's <title> as the
//  guess for a search. Server-only. Everything external comes in through
//  `LinkDeps`, so the flow is tested with fakes; `serverLinkDeps` wires the
//  real providers and the SSRF-guarded page fetch.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import { isbnFromHtml, letterboxdQuery, pageTitle as parsePageTitle, parseMediaUrl, type ParsedLink } from '@/lib/links';
import type { NormalizedResult } from '@/lib/types';

export interface LinkDeps {
  tmdbById(kind: 'movie' | 'tv', id: string): Promise<NormalizedResult | null>;
  findImdb(id: string): Promise<{ kind: 'movie' | 'tv'; result: NormalizedResult } | null>;
  aniList(type: 'ANIME' | 'MANGA', id: number): Promise<NormalizedResult | null>;
  aniListByMal(type: 'ANIME' | 'MANGA', malId: number): Promise<NormalizedResult | null>;
  igdbBySlug(slug: string): Promise<NormalizedResult | null>;
  igdbBySteam(appId: string): Promise<NormalizedResult | null>;
  isbn(isbn: string): Promise<NormalizedResult | null>;
  booksByTitle(title: string): Promise<NormalizedResult[]>;
  movies(query: string, year?: number): Promise<NormalizedResult[]>;
  openLibrary(key: string): Promise<NormalizedResult | null>;
  /** The SSRF-guarded page fetch (src/lib/safe-fetch.ts). */
  page(url: string): Promise<{ url: string; html: string } | null>;
}

export interface LinkResolution {
  /** The recognised provider, or null for an unknown link. */
  provider: ParsedLink['provider'] | null;
  /** The section the title belongs to (also set for a recognised link that found nothing). */
  slug: CategorySlug | null;
  result: NormalizedResult | null;
  /** The best title guess, for the fallback search. */
  guess: string;
  /** Why the lookup could not run (e.g. a provider key is missing). */
  message?: string;
}

/** A page's title, never throwing (odd markup just gives no guess). */
function pageTitle(html: string): string | null {
  try {
    return parsePageTitle(html);
  } catch {
    return null;
  }
}

/** The page's ISBN, never throwing. */
function pageIsbn(html: string): string | null {
  try {
    return isbnFromHtml(html);
  } catch {
    return null;
  }
}

/** "TMDB_API_KEY not configured" and friends → a friendly line (spec G4). */
function friendly(err: unknown, provider: string): string {
  const m = err instanceof Error ? err.message : '';
  return /not configured/i.test(m)
    ? `${provider} isn't set up on this server, so that link can't be looked up.`
    : `${provider} didn't answer. Try again in a moment.`;
}

/**
 * Resolve a link to a title. Never throws: a failed or unconfigured lookup
 * comes back with `result: null`, a `message` and the best guess.
 */
export async function resolveMediaLink(url: string, deps: LinkDeps): Promise<LinkResolution> {
  const parsed = parseMediaUrl(url);
  if (!parsed) {
    const page = await deps.page(url).catch(() => null);
    return { provider: null, slug: null, result: null, guess: (page && pageTitle(page.html)) || '' };
  }
  const base = { provider: parsed.provider, slug: parsed.category ?? null, result: null, guess: parsed.hint ?? '' };

  const attempt = async (
    label: string,
    run: () => Promise<{ slug: CategorySlug; result: NormalizedResult | null } | null>,
  ): Promise<LinkResolution> => {
    try {
      const found = await run();
      if (!found) return base;
      return { ...base, slug: found.slug, result: found.result };
    } catch (err) {
      return { ...base, message: friendly(err, label) };
    }
  };

  switch (parsed.provider) {
    case 'tmdb': {
      const kind = parsed.category === 'tv' ? 'tv' : 'movie';
      return attempt('TMDB', async () => ({ slug: parsed.category!, result: await deps.tmdbById(kind, parsed.id) }));
    }
    case 'imdb':
      return attempt('TMDB', async () => {
        const found = await deps.findImdb(parsed.id);
        return found ? { slug: found.kind === 'tv' ? 'tv' : 'movies', result: found.result } : null;
      });
    case 'anilist':
    case 'mal': {
      const type = parsed.category === 'manga' ? 'MANGA' : 'ANIME';
      const id = Number(parsed.id);
      return attempt('AniList', async () => ({
        slug: parsed.category!,
        result: parsed.provider === 'anilist' ? await deps.aniList(type, id) : await deps.aniListByMal(type, id),
      }));
    }
    case 'igdb':
      return attempt('IGDB', async () => ({ slug: 'games', result: await deps.igdbBySlug(parsed.id) }));
    case 'steam':
      return attempt('IGDB', async () => ({ slug: 'games', result: await deps.igdbBySteam(parsed.id) }));
    case 'letterboxd': {
      const { query, year } = letterboxdQuery(parsed.id);
      return attempt('TMDB', async () => {
        // A slug year is a hint: retry without it if nothing matched.
        let hits = await deps.movies(query, year);
        if (hits.length === 0 && year) hits = await deps.movies(query);
        return { slug: 'movies', result: hits[0] ?? null };
      });
    }
    case 'openlibrary':
      return attempt('OpenLibrary', async () => ({ slug: 'books', result: await deps.openLibrary(parsed.id) }));
    case 'goodreads':
      return attempt('OpenLibrary', async () => {
        // The ISBN from the page, else the title from the slug (or the page).
        const page = await deps.page(url).catch(() => null);
        const isbn = page ? pageIsbn(page.html) : null;
        if (isbn) {
          const hit = await deps.isbn(isbn);
          if (hit) return { slug: 'books', result: hit };
        }
        const title = parsed.hint || (page && pageTitle(page.html)) || '';
        if (title) base.guess = title;
        const hits = title ? await deps.booksByTitle(title) : [];
        return { slug: 'books', result: hits[0] ?? null };
      });
  }
}
