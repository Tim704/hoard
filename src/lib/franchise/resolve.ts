// ───────────────────────────────────────────────────────────────────────────
//  Franchise resolution — ask each provider which IP a catalogue row belongs
//  to. Server-only (talks to external APIs).
//
//   • Anime / Manga → AniList relation graph (seasons, movies, source manga …)
//   • Movies        → TMDB "belongs_to_collection"
//   • Games         → IGDB franchises / collections
//   • TV, Books, Music → no provider data; grouping falls back to titles.
// ───────────────────────────────────────────────────────────────────────────

import { anilistQuery } from '@/lib/apis/anilist';
import { fetchGameFranchise } from '@/lib/apis/igdb';
import { fetchMovieDetails } from '@/lib/apis/tmdb';
import type { CategorySlug } from '@/lib/categories';
import { isMatchable, normalizeTitle } from './normalize';

export interface FranchiseInfo {
  /** Provider-scoped id shared by every entry of the IP, or null if unknown. */
  key: string | null;
  /** Display name of the IP (falls back to the title itself). */
  name: string;
}

// Relation types that mean "same story / same IP". CHARACTER and OTHER are
// left out on purpose: they link crossovers and cameos, which would merge
// unrelated franchises into one giant blob.
const SAME_IP = new Set([
  'PREQUEL',
  'SEQUEL',
  'PARENT',
  'SIDE_STORY',
  'SUMMARY',
  'ALTERNATIVE',
  'ADAPTATION',
  'SOURCE',
  'COMPILATION',
  'CONTAINS',
]);

/** Batches of AniList lookups after the first one (~50 entries each). */
const MAX_ROUNDS = 3;

interface AniListNode {
  id: number;
  type?: string | null;
  format?: string | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  title?: { romaji?: string | null; english?: string | null } | null;
  relations?: {
    edges?: Array<{ relationType?: string | null; node?: { id: number } | null }> | null;
  } | null;
}

const NODE_FIELDS = `id type format startDate { year month day } title { romaji english }
  relations { edges { relationType node { id } } }`;

const BY_IDS = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ${NODE_FIELDS} } } }`;
const BY_MAL = `query ($mal: [Int], $type: MediaType) {
  Page(perPage: 50) { media(idMal_in: $mal, type: $type) { ${NODE_FIELDS} } } }`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function neighbours(nodes: AniListNode[]): number[] {
  const out: number[] = [];
  for (const n of nodes) {
    for (const e of n.relations?.edges ?? []) {
      if (e.node?.id && e.relationType && SAME_IP.has(e.relationType)) out.push(e.node.id);
    }
  }
  return out;
}

function startKey(n: AniListNode): number {
  const d = n.startDate;
  if (!d?.year) return Number.POSITIVE_INFINITY;
  return d.year * 10000 + (d.month ?? 12) * 100 + (d.day ?? 31);
}

/**
 * Walk the AniList relation graph from one entry and return a stable key (the
 * smallest AniList id in the explored component) plus the name of the earliest
 * entry, which is usually the original manga or first season.
 */
async function anilistFranchise(
  externalId: string,
  type: 'ANIME' | 'MANGA',
): Promise<FranchiseInfo | null> {
  // externalId is the MAL id when AniList knows one, else "al-<anilist id>".
  const start = externalId.startsWith('al-')
    ? await anilistQuery<AniListNode>(BY_IDS, { ids: [Number(externalId.slice(3))] }, 'AniList franchise')
    : await anilistQuery<AniListNode>(BY_MAL, { mal: [Number(externalId)], type }, 'AniList franchise');
  if (start.length === 0) return null;

  const fetched = new Map<number, AniListNode>(start.map((n) => [n.id, n]));
  const visited = new Set<number>(fetched.keys());
  let frontier = neighbours(start).filter((id) => !visited.has(id));

  for (let round = 0; round < MAX_ROUNDS && frontier.length > 0; round++) {
    const batch = [...new Set(frontier)].slice(0, 50);
    batch.forEach((id) => visited.add(id));
    await sleep(700); // stay under AniList's rate limit (often ~30 requests/minute)
    const nodes = await anilistQuery<AniListNode>(BY_IDS, { ids: batch }, 'AniList franchise');
    nodes.forEach((n) => fetched.set(n.id, n));
    frontier = neighbours(nodes).filter((id) => !visited.has(id));
  }

  const nodes = [...fetched.values()];
  const minId = Math.min(...nodes.map((n) => n.id));
  return { key: `anilist:${minId}`, name: pickName(nodes) };
}

/**
 * Name the IP after the title core most entries share ("jujutsu kaisen"), using
 * the shortest original spelling of it ("Jujutsu Kaisen", not "Jujutsu Kaisen
 * 0"). Falls back to the earliest entry's title.
 */
function pickName(nodes: AniListNode[]): string {
  const titled = nodes
    .map((n) => ({ n, title: n.title?.english || n.title?.romaji || '' }))
    .filter((t) => t.title);
  const counts = new Map<string, number>();
  for (const t of titled) {
    const core = normalizeTitle(t.title);
    if (isMatchable(core)) counts.set(core, (counts.get(core) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) {
    return titled
      .filter((t) => normalizeTitle(t.title) === best)
      .map((t) => t.title)
      .sort((a, b) => a.length - b.length)[0];
  }
  const root = [...titled].sort((a, b) => startKey(a.n) - startKey(b.n))[0];
  return root?.title ?? '';
}

/**
 * Resolve the franchise of one catalogue row. Returns `null` on a provider
 * failure (so the caller can retry later); otherwise always returns a name,
 * with `key` null when the provider has no franchise data.
 */
export async function resolveFranchise(
  slug: CategorySlug,
  media: { externalId: string; title: string },
): Promise<FranchiseInfo | null> {
  try {
    switch (slug) {
      case 'anime':
      case 'manga': {
        const info = await anilistFranchise(media.externalId, slug === 'anime' ? 'ANIME' : 'MANGA');
        if (!info) return { key: null, name: media.title };
        return { key: info.key, name: info.name || media.title };
      }
      case 'movies': {
        const collection = (await fetchMovieDetails(media.externalId))?.collection;
        return collection
          ? { key: `tmdb-col:${collection.id}`, name: collection.name.replace(/\s+Collection$/i, '') }
          : { key: null, name: media.title };
      }
      case 'games': {
        const fr = await fetchGameFranchise(media.externalId);
        return fr ?? { key: null, name: media.title };
      }
      default:
        return { key: null, name: media.title };
    }
  } catch {
    return null;
  }
}
