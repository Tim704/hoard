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

/** An eligible row's current tier position, as stored. */
export interface TierPosition {
  tier: Tier | null;
  rankOrder: number | null;
}

/**
 * Plan the writes for a tier save.
 *  - `placement`: the client's tiers (ids best first); ranks are rewritten as
 *    1000, 2000, … per tier, but only rows whose tier or rank actually changes
 *    are returned in `placed`.
 *  - `trayIds`: ids the client shows in the Unranked tray. Only these may be
 *    cleared (and only if currently tiered). Ids absent from both lists — e.g.
 *    an item that became eligible in another tab — are never touched.
 *  - `current`: every eligible row (COMPLETED/DROPPED, this user + category)
 *    with its stored position; any other id is ignored.
 */
export function planTierSave(
  placement: TierPlacement,
  trayIds: string[],
  current: Map<string, TierPosition>,
): { placed: { id: string; tier: Tier; rankOrder: number }[]; clearIds: string[] } {
  const placed: { id: string; tier: Tier; rankOrder: number }[] = [];
  const seen = new Set<string>();
  for (const tier of TIERS) {
    let n = 0;
    for (const id of placement[tier]) {
      const now = current.get(id);
      if (!now || seen.has(id)) continue;
      seen.add(id);
      n += 1;
      const rankOrder = n * RANK_STEP;
      if (now.tier !== tier || now.rankOrder !== rankOrder) placed.push({ id, tier, rankOrder });
    }
  }
  const clearIds: string[] = [];
  for (const id of trayIds) {
    const now = current.get(id);
    if (!now || seen.has(id) || now.tier === null) continue;
    seen.add(id);
    clearIds.push(id);
  }
  return { placed, clearIds };
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Validate an untrusted tier-save payload (server action input): every tier key
 * present with an array of string ids, and `trayIds` an array of strings.
 */
export function parseTierSave(
  placement: unknown,
  trayIds: unknown,
): { placement: TierPlacement; trayIds: string[] } | null {
  if (typeof placement !== 'object' || placement === null || !isStringArray(trayIds)) return null;
  const p = placement as Record<string, unknown>;
  const out = {} as TierPlacement;
  for (const t of TIERS) {
    const ids = p[t];
    if (!isStringArray(ids)) return null;
    out[t] = [...ids];
  }
  return { placement: out, trayIds: [...trayIds] };
}

export function acceptSuggestions(board: TierBoardData): TierPlacement {
  const placement = boardPlacement(board);
  for (const a of board.tray) {
    const t = suggestTier(a.rating);
    if (t) placement[t].push(a.id);
  }
  return placement;
}

/** Every pair of neighbours inside one tier (S first, best of each pair first). */
export function withinTierPairs(board: TierBoardData): [ActivityWithMedia, ActivityWithMedia][] {
  const pairs: [ActivityWithMedia, ActivityWithMedia][] = [];
  for (const t of TIERS) {
    const items = board.tiers[t];
    for (let i = 0; i + 1 < items.length; i++) pairs.push([items[i], items[i + 1]]);
  }
  return pairs;
}

// ─── Editing a board in local (client) state ────────────────────────────────

/** A drop target on the board: one of the six tiers or the Unranked tray. */
export type TierContainer = Tier | 'tray';

export function isTierContainer(id: string): id is TierContainer {
  return id === 'tray' || (TIERS as readonly string[]).includes(id);
}

function itemsOf(board: TierBoardData, c: TierContainer): ActivityWithMedia[] {
  return c === 'tray' ? board.tray : board.tiers[c];
}

/** Which container holds `id`, or null when it is not on the board. */
export function findContainer(board: TierBoardData, id: string): TierContainer | null {
  for (const t of TIERS) if (board.tiers[t].some((a) => a.id === id)) return t;
  return board.tray.some((a) => a.id === id) ? 'tray' : null;
}

/**
 * Move `id` into container `to` at `index` (default: the end; clamped). Within
 * one container this behaves like `arrayMove`. Returns a new board; unknown ids
 * return the board unchanged.
 */
export function moveItem(
  board: TierBoardData,
  id: string,
  to: TierContainer,
  index?: number,
): TierBoardData {
  const from = findContainer(board, id);
  if (from === null) return board;
  const item = itemsOf(board, from).find((a) => a.id === id) as ActivityWithMedia;

  const next: TierBoardData = { tiers: { ...board.tiers }, tray: board.tray };
  const set = (c: TierContainer, items: ActivityWithMedia[]) => {
    if (c === 'tray') next.tray = items;
    else next.tiers[c] = items;
  };

  set(from, itemsOf(board, from).filter((a) => a.id !== id));
  const target = [...itemsOf(next, to)];
  const at = Math.max(0, Math.min(index ?? target.length, target.length));
  target.splice(at, 0, item);
  set(to, target);
  return next;
}

/** Where a drop over `overId` (a container or an item) lands. */
export function resolveDrop(
  board: TierBoardData,
  overId: string,
): { container: TierContainer; index: number } | null {
  if (isTierContainer(overId)) {
    return { container: overId, index: itemsOf(board, overId).length };
  }
  const container = findContainer(board, overId);
  if (container === null) return null;
  return { container, index: itemsOf(board, container).findIndex((a) => a.id === overId) };
}

/** The placement `saveTiers` persists: tier ids in board order (tray excluded). */
export function boardPlacement(board: TierBoardData): TierPlacement {
  return Object.fromEntries(
    TIERS.map((t) => [t, board.tiers[t].map((a) => a.id)]),
  ) as TierPlacement;
}
