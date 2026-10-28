// ───────────────────────────────────────────────────────────────────────────
//  Arena matchmaking (spec 4.3 / 4.4). Pure and client-safe.
//
//  - Confidence: every duel adds one to both titles' `duels`. Among the valid
//    pairs (tier neighbours, or titles sharing a whole score) the Arena picks
//    the pair with the FEWEST combined duels, ties broken at random, so the
//    least-tested parts of the order get looked at first.
//  - Challenge tiers: pairs the bottom title of a tier with the top title of
//    the next lower non-empty tier ("is the best B really worse than the
//    worst A?"). Nothing moves on its own: when the lower title wins the same
//    pairing twice in one Arena session (the client keeps the count and
//    passes it back), the Arena suggests moving it up.
// ───────────────────────────────────────────────────────────────────────────

import { TIERS, type Tier } from '@/lib/tiers';

/** Anything the Arena duels: an id and how many duels it has had. */
export interface Duelist {
  id: string;
  duels: number;
}

export type Rand = () => number;

/** One of the pairs with the fewest combined duels (random among ties), or null. */
export function fewestDuelsPair<T extends Duelist>(
  pairs: readonly (readonly [T, T])[],
  rand: Rand = Math.random,
): [T, T] | null {
  if (pairs.length === 0) return null;
  const sum = ([a, b]: readonly [T, T]) => a.duels + b.duels;
  const min = Math.min(...pairs.map(sum));
  const best = pairs.filter((p) => sum(p) === min);
  const [a, b] = best[Math.min(best.length - 1, Math.floor(rand() * best.length))];
  return [a, b];
}

/**
 * The least-dueled pair inside one bucket of interchangeable titles (same
 * whole score): the two with the fewest duels, random among equals. Linear in
 * the bucket, so a big library never builds every pair.
 */
export function bucketPair<T extends Duelist>(items: readonly T[], rand: Rand = Math.random): [T, T] | null {
  if (items.length < 2) return null;
  // Random keys, then a stable sort by duels: equal duels end up shuffled.
  const keyed = items.map((item) => ({ item, key: rand() }));
  keyed.sort((x, y) => x.item.duels - y.item.duels || x.key - y.key);
  return [keyed[0].item, keyed[1].item];
}

/** A cross-tier challenge: `upper` is the bottom of `upperTier`, `lower` the top of `lowerTier`. */
export interface ChallengePair<T> {
  upper: T;
  lower: T;
  upperTier: Tier;
  lowerTier: Tier;
}

/** Every challenge on a board: one per non-empty tier that has a non-empty tier below it. */
export function challengePairs<T>(tiers: Record<Tier, readonly T[]>): ChallengePair<T>[] {
  const filled = TIERS.filter((t) => tiers[t].length > 0);
  const out: ChallengePair<T>[] = [];
  for (let i = 0; i + 1 < filled.length; i++) {
    const upperTier = filled[i];
    const lowerTier = filled[i + 1];
    const up = tiers[upperTier];
    out.push({ upper: up[up.length - 1], lower: tiers[lowerTier][0], upperTier, lowerTier });
  }
  return out;
}

/** Lower-title wins per pairing in this Arena session: "upperId>lowerId" → count. */
export type ChallengeHistory = Record<string, number>;

export const challengeKey = (upperId: string, lowerId: string): string => `${upperId}>${lowerId}`;

/** How many wins of the lower title trigger the "Move it up?" suggestion. */
export const CHALLENGE_WINS_TO_SUGGEST = 2;
/** Pairings remembered per session (the history comes back from the client). */
const MAX_HISTORY = 100;

/**
 * Validate a history sent by the client: string keys of the right shape and
 * small non-negative integer counts; anything else is dropped.
 */
export function parseChallengeHistory(raw: unknown): ChallengeHistory {
  const out: ChallengeHistory = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_HISTORY) break;
    if (k.length > 130 || !/^[^>]{1,64}>[^>]{1,64}$/.test(k)) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > CHALLENGE_WINS_TO_SUGGEST) continue;
    out[k] = v;
    n += 1;
  }
  return out;
}

/**
 * Record a challenge duel. When the lower title has now beaten the upper one
 * twice, `suggest` is true and that pairing's count starts over (so a
 * dismissed suggestion needs two more wins to come back). Upper wins change
 * nothing.
 */
export function applyChallengeResult(
  history: ChallengeHistory,
  pair: { upperId: string; lowerId: string },
  winnerId: string,
): { history: ChallengeHistory; suggest: boolean } {
  if (winnerId !== pair.lowerId) return { history, suggest: false };
  const key = challengeKey(pair.upperId, pair.lowerId);
  const wins = (history[key] ?? 0) + 1;
  if (wins >= CHALLENGE_WINS_TO_SUGGEST) {
    const next = { ...history };
    delete next[key];
    return { history: next, suggest: true };
  }
  return { history: { ...history, [key]: wins }, suggest: false };
}
