// ───────────────────────────────────────────────────────────────────────────
//  Compare with another user (spec 9.1). Pure: the maths and the shaping.
//
//  Privacy (G2): only used once BOTH users passed the compareOptIn gate
//  (`canCompare` in src/lib/together.ts, re-checked on every request by
//  src/lib/data-compare.ts). The inputs carry nothing but the catalogue key,
//  the score and the tier of each title, so nothing else (notes, reviews,
//  dates, queues, statuses) can leak through these results.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';

/** Shared scored titles needed before a compatibility score is shown. */
export const MIN_SHARED_SCORES = 5;
/** How many disagreements are listed. */
export const DISAGREEMENT_LIMIT = 10;

/** One title in a user's library, reduced to what Compare may use. */
export interface CompareEntry {
  slug: CategorySlug;
  mediaId: string;
  rating: number | null;
  tier: string | null;
}

export interface SharedTitle {
  slug: CategorySlug;
  mediaId: string;
  myRating: number | null;
  theirRating: number | null;
}

export interface Disagreement extends SharedTitle {
  myRating: number;
  theirRating: number;
  /** |mine − theirs| */
  gap: number;
}

export type Compatibility =
  | { score: number; shared: number }
  | { score: null; shared: number; reason: 'too-few' | 'no-spread' };

export interface Comparison {
  shared: SharedTitle[];
  disagreements: Disagreement[];
  compatibility: Compatibility;
  /** Their S-tier titles that aren't in my library at all. */
  theirSMissing: { slug: CategorySlug; mediaId: string }[];
}

const keyOf = (e: { slug: string; mediaId: string }) => `${e.slug}\u0000${e.mediaId}`;
const scored = (v: number | null): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Pearson's correlation coefficient of two equally long series, or null when
 * it is undefined (fewer than two points, or one side doesn't vary).
 */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  // Float noise on identical values must count as "no spread".
  if (vx < 1e-12 || vy < 1e-12) return null;
  const r = cov / Math.sqrt(vx * vy);
  return Math.max(-1, Math.min(1, r));
}

/**
 * Compatibility from the pairs of scores both users gave the same titles:
 * Pearson's r mapped to 0–100 as round((r + 1) / 2 × 100). Needs at least
 * MIN_SHARED_SCORES pairs; with no spread on one side there is no score.
 */
export function compatibility(pairs: readonly [number, number][]): Compatibility {
  const shared = pairs.length;
  if (shared < MIN_SHARED_SCORES) return { score: null, shared, reason: 'too-few' };
  const r = pearson(
    pairs.map((p) => p[0]),
    pairs.map((p) => p[1]),
  );
  if (r === null) return { score: null, shared, reason: 'no-spread' };
  return { score: Math.round(((r + 1) / 2) * 100), shared };
}

/** Everything Compare shows, from both libraries (one entry per title each). */
export function buildComparison(mine: readonly CompareEntry[], theirs: readonly CompareEntry[]): Comparison {
  const myMap = new Map<string, CompareEntry>();
  for (const e of mine) if (!myMap.has(keyOf(e))) myMap.set(keyOf(e), e);

  const shared: SharedTitle[] = [];
  const theirSMissing: { slug: CategorySlug; mediaId: string }[] = [];
  const seen = new Set<string>();
  for (const t of theirs) {
    const k = keyOf(t);
    if (seen.has(k)) continue;
    seen.add(k);
    const m = myMap.get(k);
    if (m) {
      shared.push({
        slug: t.slug,
        mediaId: t.mediaId,
        myRating: scored(m.rating) ? m.rating : null,
        theirRating: scored(t.rating) ? t.rating : null,
      });
    } else if (t.tier === 'S') {
      theirSMissing.push({ slug: t.slug, mediaId: t.mediaId });
    }
  }

  const bothScored = shared.filter(
    (s): s is SharedTitle & { myRating: number; theirRating: number } => s.myRating !== null && s.theirRating !== null,
  );
  const disagreements: Disagreement[] = bothScored
    .map((s) => ({ ...s, gap: Math.abs(s.myRating - s.theirRating) }))
    .filter((d) => d.gap > 1e-9)
    .sort((a, b) => b.gap - a.gap || a.slug.localeCompare(b.slug) || a.mediaId.localeCompare(b.mediaId))
    .slice(0, DISAGREEMENT_LIMIT);

  return {
    shared,
    disagreements,
    compatibility: compatibility(bothScored.map((s) => [s.myRating, s.theirRating])),
    theirSMissing,
  };
}
