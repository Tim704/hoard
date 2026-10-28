// ───────────────────────────────────────────────────────────────────────────
//  "More by the same people" (spec 5.10): the provider lookups, per section,
//  cached in memory for an hour per title (the library filter is applied by
//  the caller, per user). Server-only. Every call has the provider timeout;
//  a missing key or an unreachable provider becomes a friendly line.
//
//    movies / TV   directors (creators) + top-billed cast from the stored
//                  credits → TMDB person combined credits, first 2 people
//    books         the first author's best-known works (OpenLibrary)
//    anime / manga the main studio and first-billed staff (AniList)
//    games         the developer's other games (IGDB involved_companies)
//    music         the artist's top albums (Last.fm)
// ───────────────────────────────────────────────────────────────────────────

import { fetchAniListPeople } from '@/lib/apis/anilist';
import { fetchAuthorWorks } from '@/lib/apis/books';
import { isLookupSkipped } from '@/lib/apis/details';
import { fetchDeveloperGames, igdbConfigured } from '@/lib/apis/igdb';
import { fetchArtistTopAlbums, lastfmConfigured } from '@/lib/apis/music';
import { fetchPersonCredits, mapCombinedCredits, tmdbConfigured } from '@/lib/apis/tmdb';
import type { CategorySlug } from '@/lib/categories';
import { pickPeople, type MoreByAnswer, type MoreByGroup } from '@/lib/more-by';

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; answer: MoreByAnswer }>();

/** What the lookup needs from the stored row. */
export interface MoreBySource {
  externalId: string;
  directors?: string[] | null;
  cast?: string[] | null;
  authors?: string[] | null;
  artist?: string | null;
}

const message = (m: string): MoreByAnswer => ({ status: 'message', message: m });
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

async function lookup(slug: CategorySlug, src: MoreBySource): Promise<MoreByAnswer> {
  switch (slug) {
    case 'movies':
    case 'tv': {
      if (!tmdbConfigured()) return message("TMDB isn't configured on this server, so credits can't be looked up.");
      const people = pickPeople(strings(src.directors), strings(src.cast));
      if (!people.length) return message('No credits are stored for this title yet. They arrive with the nightly details refresh.');
      const groups: MoreByGroup[] = [];
      for (const name of people) {
        const json = await fetchPersonCredits(name);
        if (!json) continue;
        groups.push({ label: `More with ${name}`, items: mapCombinedCredits(json).map(({ slug: s, result }) => ({ slug: s, result })) });
      }
      return { status: 'ok', groups };
    }
    case 'books': {
      const author = strings(src.authors)[0];
      if (!author) return message('No author is stored for this book.');
      return { status: 'ok', groups: [{ label: `More by ${author}`, items: (await fetchAuthorWorks(author)).map((result) => ({ slug: 'books', result })) }] };
    }
    case 'anime':
    case 'manga': {
      const groups = await fetchAniListPeople(slug === 'anime' ? 'ANIME' : 'MANGA', src.externalId);
      if (!groups) return message('AniList has no studio or staff for this title.');
      return { status: 'ok', groups: groups.map((g) => ({ label: g.label, items: g.results })) };
    }
    case 'games': {
      if (!igdbConfigured()) return message("IGDB isn't configured on this server, so developers can't be looked up.");
      const found = await fetchDeveloperGames(src.externalId);
      if (!found) return message('IGDB lists no developer for this game.');
      return { status: 'ok', groups: [{ label: `More from ${found.developer}`, items: found.games.map((result) => ({ slug: 'games', result })) }] };
    }
    case 'music': {
      if (!lastfmConfigured()) return message("Last.fm isn't configured on this server, so albums can't be looked up.");
      const artist = src.artist?.trim();
      if (!artist) return message('No artist is stored for this album.');
      return { status: 'ok', groups: [{ label: `More by ${artist}`, items: (await fetchArtistTopAlbums(artist)).map((result) => ({ slug: 'music', result })) }] };
    }
  }
}

/**
 * The groups for one stored title (before the per-user library filter).
 * Hand-made and demo rows have no provider id to look up. Never throws.
 */
export async function moreByFor(slug: CategorySlug, src: MoreBySource, now = Date.now()): Promise<MoreByAnswer> {
  if (isLookupSkipped(src.externalId)) return message('This title was added by hand, so there are no linked credits to look up.');
  const key = `${slug}:${src.externalId}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.answer;
  let answer: MoreByAnswer;
  try {
    answer = await lookup(slug, src);
  } catch {
    // Failures aren't cached, so the next open tries again.
    return message('Could not reach the provider right now. Try again later.');
  }
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { at: now, answer });
  return answer;
}
