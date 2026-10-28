// ───────────────────────────────────────────────────────────────────────────
//  Reference lists (spec 4.8): the provider calls behind the built-in lists.
//  Server-only. Each call fetches ONE provider page (8 s timeout, G4).
// ───────────────────────────────────────────────────────────────────────────

import { fetchAniListTop } from '@/lib/apis/anilist';
import { fetchIgdbTopGames, igdbConfigured } from '@/lib/apis/igdb';
import { fetchTmdbTopRated, tmdbConfigured } from '@/lib/apis/tmdb';
import { BUILTIN_REF_LISTS, type BuiltinSource, type RefItem } from '@/lib/reflists';
import type { NormalizedResult } from '@/lib/types';

/** Whether the provider behind a built-in has its key on this server. */
export function refSourceConfigured(source: BuiltinSource): boolean {
  const provider = BUILTIN_REF_LISTS[source].provider;
  if (provider === 'TMDB') return tmdbConfigured();
  if (provider === 'IGDB') return igdbConfigured();
  return true; // AniList needs no key
}

export const toRefItem = (r: NormalizedResult): RefItem => ({
  externalId: r.externalId,
  title: r.title,
  year: r.year ?? null,
  imageUrl: typeof r.imageUrl === 'string' && /^https:\/\//i.test(r.imageUrl) ? r.imageUrl : null,
});

/** Page `page` (0-based) of a built-in list, as reference items. */
export async function fetchRefPage(source: BuiltinSource, page: number): Promise<RefItem[]> {
  let hits: NormalizedResult[];
  switch (source) {
    case 'tmdb-movies':
      hits = await fetchTmdbTopRated('movie', page + 1);
      break;
    case 'tmdb-tv':
      hits = await fetchTmdbTopRated('tv', page + 1);
      break;
    case 'anilist-anime':
      hits = await fetchAniListTop('ANIME', page + 1);
      break;
    case 'anilist-manga':
      hits = await fetchAniListTop('MANGA', page + 1);
      break;
    case 'igdb-games':
      hits = page === 0 ? await fetchIgdbTopGames() : [];
      break;
  }
  return hits.map(toRefItem);
}
