// ───────────────────────────────────────────────────────────────────────────
//  Reading a public AniList profile's lists (spec 2.1, reused by the 8.2
//  nightly sync). Server-only, not a server action: callers authenticate.
//  An unknown or private user is a friendly error, not a throw.
// ───────────────────────────────────────────────────────────────────────────

import { anilistGraphql } from '@/lib/apis/anilist';

import { ANILIST_COLLECTION_QUERY, type AniListCollection, type AniListListType } from './sources/anilist';

/** Most AniList chunks (500 entries each) read per list type. */
export const MAX_ANILIST_CHUNKS = 10;

export type AniListLists =
  | { ok: true; lists: Record<AniListListType, AniListCollection[]> }
  | { ok: false; error: string };

export async function readAniListLists(user: string): Promise<AniListLists> {
  const lists: Record<AniListListType, AniListCollection[]> = { ANIME: [], MANGA: [] };
  for (const type of ['ANIME', 'MANGA'] as const) {
    for (let chunk = 1; chunk <= MAX_ANILIST_CHUNKS; chunk++) {
      const answer = await anilistGraphql<{ MediaListCollection: AniListCollection | null }>(
        ANILIST_COLLECTION_QUERY,
        { user, type, chunk },
        'AniList list',
      );
      const message = answer.errors[0]?.message ?? '';
      if (/not found/i.test(message)) return { ok: false, error: `No AniList user called "${user}".` };
      if (/private/i.test(message)) {
        return { ok: false, error: `${user}'s AniList profile is private. Make it public in AniList's settings, then try again.` };
      }
      const collection = answer.data?.MediaListCollection;
      if (!collection) return { ok: false, error: message ? `AniList: ${message}` : 'AniList did not answer. Try again later.' };
      lists[type].push(collection);
      if (!collection.hasNextChunk) break;
    }
  }
  return { ok: true, lists };
}
