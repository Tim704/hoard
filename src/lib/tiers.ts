import type { ActivityWithMedia } from '@/lib/types';
import type { Status } from '@/lib/status';

export const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
export type Tier = (typeof TIERS)[number];

const RANK_STEP = 1000;

/** Only finished (or abandoned) titles can be placed on the tier list. */
export function isTierEligible(status: Status): boolean {
  return status === 'COMPLETED' || status === 'DROPPED';
}

export function suggestTier(rating: number | null): Tier | null {
  if (rating === null) return null;
  if (rating >= 9) return 'S';
  if (rating >= 8) return 'A';
  if (rating >= 7) return 'B';
  if (rating >= 6) return 'C';
  if (rating >= 5) return 'D';
  return 'F';
}

/** S=0 … F=5, unplaced=6. */
export function tierIndex(tier: Tier | null): number {
  return tier === null ? TIERS.length : TIERS.indexOf(tier);
}

function byRankThenRating(a: ActivityWithMedia, b: ActivityWithMedia): number {
  if (a.rankOrder !== b.rankOrder) {
    if (a.rankOrder === null) return 1;
    if (b.rankOrder === null) return -1;
    return a.rankOrder - b.rankOrder;
  }
  return (
    (b.rating ?? -Infinity) - (a.rating ?? -Infinity) ||
    b.elo - a.elo ||
    a.media.title.localeCompare(b.media.title)
  );
}

export function compareTierOrder(a: ActivityWithMedia, b: ActivityWithMedia): number {
  return tierIndex(a.tier) - tierIndex(b.tier) || byRankThenRating(a, b);
}

export interface TierBoardData {
  tiers: Record<Tier, ActivityWithMedia[]>;
  tray: ActivityWithMedia[];
}

export function buildTierBoard(all: ActivityWithMedia[]): TierBoardData {
  const tiers = Object.fromEntries(TIERS.map((t) => [t, [] as ActivityWithMedia[]])) as Record<
    Tier,
    ActivityWithMedia[]
  >;
  const tray: ActivityWithMedia[] = [];
  for (const a of all) {
    if (!isTierEligible(a.status)) continue;
    if (a.tier === null) tray.push(a);
    else tiers[a.tier].push(a);
  }
  for (const t of TIERS) tiers[t].sort(byRankThenRating);
  tray.sort(byRankThenRating);
  return { tiers, tray };
}

export type TierPlacement = Record<Tier, string[]>;

export function planTierSave(
  placement: TierPlacement,
  eligibleIds: Set<string>,
): { placed: { id: string; tier: Tier; rankOrder: number }[]; clearIds: string[] } {
  const placed: { id: string; tier: Tier; rankOrder: number }[] = [];
  const seen = new Set<string>();
  for (const tier of TIERS) {
    let n = 0;
    for (const id of placement[tier]) {
      if (!eligibleIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      n += 1;
      placed.push({ id, tier, rankOrder: n * RANK_STEP });
    }
  }
  const clearIds = [...eligibleIds].filter((id) => !seen.has(id));
  return { placed, clearIds };
}

export function acceptSuggestions(board: TierBoardData): TierPlacement {
  const placement = Object.fromEntries(
    TIERS.map((t) => [t, board.tiers[t].map((a) => a.id)]),
  ) as TierPlacement;
  for (const a of board.tray) {
    const t = suggestTier(a.rating);
    if (t) placement[t].push(a.id);
  }
  return placement;
}
