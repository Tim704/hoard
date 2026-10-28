// ───────────────────────────────────────────────────────────────────────────
//  Match scoring for imports (spec 2.1). Pure: given an import row and the
//  provider's search hits, pick the best hit and say how sure we are.
//
//    id match (MAL / AniList / ISBN / externalId)        → high
//    same normalised title and the same year             → high
//    same title, but one side has no year                → medium
//    anything else (different year, a different title)   → low
//    no hits                                             → none
//
//  "Same title" compares `matchKey`s (case, accents, punctuation, "&" and a
//  leading "The" ignored), either the whole title or — when only one side has
//  a subtitle — the part before it ("Dune" vs "Dune: Part One").
// ───────────────────────────────────────────────────────────────────────────

import type { NormalizedResult } from '@/lib/types';

import type { ImportRow, MatchConfidence } from './types';

/** Most candidates offered per row. */
export const MAX_CANDIDATES = 3;

/** A title reduced for comparison: "The Lord of the Rings: The Two Towers!" → "lord of the rings the two towers". */
export function matchKey(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
    .replace(/\s+/g, ' ');
}

/** The part before a subtitle separator (":", " - ", "–", "—"), as a matchKey. */
function mainKey(title: string): string {
  return matchKey(title.split(/\s*[:–—]\s*|\s+-\s+/)[0] ?? title);
}

function hasSubtitle(title: string): boolean {
  return /\s*[:–—]\s*|\s+-\s+/.test(title);
}

/** Whether two titles are the same work's title (see the header). */
export function titlesMatch(a: string, b: string): boolean {
  const ka = matchKey(a);
  if (ka !== '' && ka === matchKey(b)) return true;
  // One side carries a subtitle the other leaves off.
  if (hasSubtitle(a) !== hasSubtitle(b)) {
    const ma = mainKey(a);
    return ma !== '' && ma === mainKey(b);
  }
  return false;
}

/** How well one hit fits the row, without ids. */
export function hitConfidence(row: Pick<ImportRow, 'title' | 'year'>, hit: Pick<NormalizedResult, 'title' | 'year'>): Exclude<MatchConfidence, 'none'> {
  if (!titlesMatch(row.title, hit.title)) return 'low';
  if (row.year != null && hit.year != null) return row.year === hit.year ? 'high' : 'low';
  return 'medium';
}

const RANK: Record<MatchConfidence, number> = { high: 3, medium: 2, low: 1, none: 0 };

export interface ScoredMatch {
  candidates: NormalizedResult[];
  chosenIndex: number;
  confidence: MatchConfidence;
}

/**
 * Pick the best of `hits` for `row`. `idMatch` is the index of a hit found by
 * id (always chosen, high). Otherwise the hit with the best confidence wins,
 * ties going to the provider's own order. The chosen hit comes first, then
 * the next best, up to MAX_CANDIDATES (duplicates by externalId dropped).
 */
export function scoreMatch(row: Pick<ImportRow, 'title' | 'year'>, hits: NormalizedResult[], idMatch = -1): ScoredMatch {
  const idExternal = idMatch >= 0 ? hits[idMatch]?.externalId : undefined;
  const unique: NormalizedResult[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (seen.has(h.externalId)) continue;
    seen.add(h.externalId);
    unique.push(h);
  }
  if (unique.length === 0) return { candidates: [], chosenIndex: -1, confidence: 'none' };

  const scored = unique.map((hit, order) => {
    const byId = hit.externalId === idExternal;
    return { hit, order, byId, confidence: byId ? ('high' as const) : hitConfidence(row, hit) };
  });
  scored.sort(
    (a, b) => Number(b.byId) - Number(a.byId) || RANK[b.confidence] - RANK[a.confidence] || a.order - b.order,
  );
  const top = scored.slice(0, MAX_CANDIDATES);
  return { candidates: top.map((s) => s.hit), chosenIndex: 0, confidence: top[0].confidence };
}

/** Rows below this are left unticked in the review screen. */
export function includedByDefault(confidence: MatchConfidence): boolean {
  return confidence === 'high' || confidence === 'medium';
}
