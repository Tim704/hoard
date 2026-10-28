// ───────────────────────────────────────────────────────────────────────────
//  "Add missing titles" (spec 2.10): which entries of a franchise's IP the
//  user doesn't have yet. The provider walk and the set difference are pure
//  here (every call goes through small deps, so they are fixture-tested);
//  `franchiseMissing` in src/lib/actions/franchise.ts supplies the real ones.
//
//    Anime / Manga   AniList relations from the members, following the same
//                    relation types as the resolver (SAME_IP), both types
//    Movies          the TMDB collection's films (franchiseKey "tmdb-col:<id>")
//    Games           the IGDB franchise / collection's main games
//                    (franchiseKey "igdb-fr:<id>" / "igdb-col:<id>")
// ───────────────────────────────────────────────────────────────────────────

import { mapAnime, mapManga, type AniListMedia } from '@/lib/apis/anilist';
import type { CategorySlug } from '@/lib/categories';
import type { NormalizedResult } from '@/lib/types';

import { SAME_IP } from './resolve';

/** An AniList entry with its relations (the fields `mapAnime` / `mapManga` read, plus graph data). */
export interface AniListGraphNode extends AniListMedia {
  type?: string | null;
  format?: string | null;
  isAdult?: boolean | null;
  relations?: {
    edges?: Array<{ relationType?: string | null; node?: { id: number } | null }> | null;
  } | null;
}

/** The node fields the walk asks for: everything the search mappers read, plus relations. */
export const GRAPH_FIELDS = `id idMal type format isAdult
  title { romaji english native }
  coverImage { large medium }
  description seasonYear startDate { year month day }
  episodes chapters volumes averageScore genres
  nextAiringEpisode { airingAt episode }
  studios(isMain: true) { nodes { name } }
  relations { edges { relationType node { id } } }`;

export interface AniListGraphDeps {
  /** Entries by MAL id (MAL ids repeat across anime and manga, so per type). */
  byMal(type: 'ANIME' | 'MANGA', malIds: number[]): Promise<AniListGraphNode[]>;
  /** Entries by AniList id. */
  byIds(ids: number[]): Promise<AniListGraphNode[]>;
  pause(ms: number): Promise<void>;
}

/** Neighbours through same-IP relations only (CHARACTER / OTHER crossovers are left out). */
export function sameIpNeighbours(nodes: AniListGraphNode[]): number[] {
  const out: number[] = [];
  for (const n of nodes) {
    for (const e of n.relations?.edges ?? []) {
      if (e.node?.id && e.relationType && SAME_IP.has(e.relationType)) out.push(e.node.id);
    }
  }
  return out;
}

/** The members' anime / manga externalIds → where the walk starts. */
export function aniListStart(members: Array<{ slug: CategorySlug; externalId: string }>): {
  mal: { ANIME: number[]; MANGA: number[] };
  al: number[];
} {
  const start = { mal: { ANIME: [] as number[], MANGA: [] as number[] }, al: [] as number[] };
  for (const m of members) {
    if (m.slug !== 'anime' && m.slug !== 'manga') continue;
    const al = /^al-(\d+)$/.exec(m.externalId);
    if (al) start.al.push(Number(al[1]));
    else if (/^\d+$/.test(m.externalId)) start.mal[m.slug === 'anime' ? 'ANIME' : 'MANGA'].push(Number(m.externalId));
  }
  return start;
}

/** Lookups after the first one, and ids per lookup (AniList's page size). */
export const WALK_ROUNDS = 3;
const BATCH = 50;
/** Pause between AniList calls (it rate-limits at ~30–90 a minute). */
export const WALK_GAP_MS = 700;

/**
 * Walk the relation graph from the members (breadth first, WALK_ROUNDS
 * rounds of up to 50 new ids) and return every entry seen, the members
 * included. Same bounds as the resolver, so a sprawling IP stays a few calls.
 */
export async function walkAniList(start: ReturnType<typeof aniListStart>, deps: AniListGraphDeps): Promise<AniListGraphNode[]> {
  const fetched = new Map<number, AniListGraphNode>();
  let calls = 0;
  const call = async (run: () => Promise<AniListGraphNode[]>) => {
    if (calls++ > 0) await deps.pause(WALK_GAP_MS);
    for (const n of await run()) fetched.set(n.id, n);
  };
  for (const type of ['ANIME', 'MANGA'] as const) {
    const ids = [...new Set(start.mal[type])].slice(0, BATCH);
    if (ids.length) await call(() => deps.byMal(type, ids));
  }
  const al = [...new Set(start.al)].filter((id) => !fetched.has(id)).slice(0, BATCH);
  if (al.length) await call(() => deps.byIds(al));

  const visited = new Set<number>([...fetched.keys(), ...al]);
  let frontier = sameIpNeighbours([...fetched.values()]).filter((id) => !visited.has(id));
  for (let round = 0; round < WALK_ROUNDS && frontier.length > 0; round++) {
    const batch = [...new Set(frontier)].slice(0, BATCH);
    batch.forEach((id) => visited.add(id));
    const before = new Set(fetched.keys());
    await call(() => deps.byIds(batch));
    const fresh = [...fetched.values()].filter((n) => !before.has(n.id));
    frontier = sameIpNeighbours(fresh).filter((id) => !visited.has(id));
  }
  return [...fetched.values()];
}

/** A franchise entry the user could add: its section and the add-ready result. */
export interface MissingTitle {
  slug: CategorySlug;
  result: NormalizedResult;
}

/**
 * Graph nodes → add-ready results (the same mappers as search). Music videos
 * and adult entries are left out, as search leaves adult ones out.
 */
export function nodesToTitles(nodes: AniListGraphNode[]): MissingTitle[] {
  const out: MissingTitle[] = [];
  for (const n of nodes) {
    if (n.isAdult || n.format === 'MUSIC') continue;
    if (n.type === 'ANIME') out.push({ slug: 'anime', result: mapAnime(n) });
    else if (n.type === 'MANGA') out.push({ slug: 'manga', result: mapManga(n) });
  }
  return out;
}

const keyOf = (t: { slug: CategorySlug; result: { externalId: string } }) => `${t.slug}|${t.result.externalId}`;

/**
 * The titles the user doesn't have: drop every `slug|externalId` in `owned`
 * (their whole library, not only this franchise) and duplicates, then sort
 * by section order of first appearance and year (unknown years last).
 */
export function missingTitles(candidates: MissingTitle[], owned: Set<string>): MissingTitle[] {
  const seen = new Set<string>();
  const out: MissingTitle[] = [];
  for (const c of candidates) {
    const k = keyOf(c);
    if (owned.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  const slugOrder = [...new Set(out.map((t) => t.slug))];
  return out.sort(
    (a, b) =>
      slugOrder.indexOf(a.slug) - slugOrder.indexOf(b.slug) ||
      (a.result.year ?? Infinity) - (b.result.year ?? Infinity) ||
      a.result.title.localeCompare(b.result.title),
  );
}

/** The provider keys among the members' franchiseKeys, by provider. */
export function providerKeys(keys: Array<string | null | undefined>): { tmdbCollections: number[]; igdb: string[] } {
  const tmdbCollections = new Set<number>();
  const igdb = new Set<string>();
  for (const k of keys) {
    if (!k) continue;
    const col = /^tmdb-col:(\d{1,12})$/.exec(k);
    if (col) tmdbCollections.add(Number(col[1]));
    else if (/^igdb-(fr|col):\d{1,12}$/.test(k)) igdb.add(k);
  }
  return { tmdbCollections: [...tmdbCollections], igdb: [...igdb] };
}
