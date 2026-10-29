// ───────────────────────────────────────────────────────────────────────────
//  The dashboard's tiles (Settings → Themes, and Customize on the dashboard):
//  which show and in what order, from `prefs.dashboard = {order, hidden}`.
//
//  The stored lists are read leniently (src/lib/prefs.ts), so they may hold
//  unknown or repeated ids, or miss tiles added since they were saved; every
//  function here copes. A missing tile takes its default place.
//
//  Pure, and free of React, zod and prisma: the page and the editor share it.
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import { TILE_IDS, isTileId, type TileId } from '@/lib/dashboard-tile-ids';

/** `prefs.dashboard` as stored (lenient: any strings). */
export interface DashboardTilesPref {
  order: readonly string[];
  hidden: readonly string[];
}

/** The known tile ids in a stored list, each once, in their stored order. */
export function knownTileIds(ids: readonly unknown[]): TileId[] {
  const seen = new Set<TileId>();
  for (const id of ids) if (isTileId(id)) seen.add(id);
  return [...seen];
}

/**
 * Every tile, in the saved order: unknown and repeated ids dropped, and each
 * tile missing from it put right after the nearest earlier tile (in default
 * order) that is there, or first when none is. An empty order is the default.
 */
export function normalizeOrder(saved: readonly unknown[]): TileId[] {
  const order = knownTileIds(saved);
  TILE_IDS.forEach((id, i) => {
    if (order.includes(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const before = order.indexOf(TILE_IDS[j]);
      if (before >= 0) {
        at = before + 1;
        break;
      }
    }
    order.splice(at, 0, id);
  });
  return order;
}

/**
 * True when the saved order comes out as the default one. Where Recommend is
 * stored doesn't count: it always shows first (pinRecommend).
 */
export function isDefaultOrder(order: readonly unknown[]): boolean {
  const normal = pinRecommend(normalizeOrder(order));
  return normal.every((id, i) => id === TILE_IDS[i]);
}

/** The section a section tile (`cat:books`) stands for; null for the others. */
export function tileSection(id: TileId): CategorySlug | null {
  return id.startsWith('cat:') ? (id.slice(4) as CategorySlug) : null;
}

/** The tiles of the sections hidden in Settings (they never show, nor list in the editor). */
export function isHiddenSectionTile(id: TileId, hiddenSections: readonly string[]): boolean {
  const slug = tileSection(id);
  return slug !== null && hiddenSections.includes(slug);
}

/**
 * The tiles to show, in order: the saved order without the hidden tiles and
 * without the tiles of sections hidden in Settings. Recommend (the header
 * button) is always first when it shows.
 */
export function resolveTiles(saved: DashboardTilesPref, hiddenSections: readonly string[]): TileId[] {
  const hidden = new Set<string>(saved.hidden);
  const tiles = normalizeOrder(saved.order).filter((id) => !hidden.has(id) && !isHiddenSectionTile(id, hiddenSections));
  return pinRecommend(tiles);
}

/** Recommend moved to the front, if it is there. */
export function pinRecommend(order: readonly TileId[]): TileId[] {
  return order.includes('recommend') ? ['recommend', ...order.filter((id) => id !== 'recommend')] : [...order];
}

/** Which of the dashboard's loaders the shown tiles need. */
export interface DataNeeds {
  /** Per-section stats: the section tiles and the overview. */
  stats: boolean;
  nowConsuming: boolean;
  favourites: boolean;
  comingUp: boolean;
  goals: boolean;
}

export function dataNeeds(tiles: readonly TileId[]): DataNeeds {
  return {
    stats: tiles.some((id) => id === 'overview' || tileSection(id) !== null),
    nowConsuming: tiles.includes('now-consuming'),
    favourites: tiles.includes('favourites'),
    comingUp: tiles.includes('coming-up'),
    goals: tiles.includes('goals'),
  };
}

/**
 * `order` with its listed tiles (those in `listedOrder`) in that order, in the
 * places listed tiles held: the others (sections hidden in Settings) keep
 * their places.
 */
export function placeListed(order: readonly TileId[], listedOrder: readonly TileId[]): TileId[] {
  const listed = new Set(listedOrder);
  let next = 0;
  return order.map((id) => (listed.has(id) ? listedOrder[next++] : id));
}

/**
 * Moves `id` past the previous (`up`) or next (`down`) listed tile: the two
 * swap places. Tiles that aren't listed keep theirs. A no-op at either end
 * and for a tile that isn't listed.
 */
export function moveTile(
  order: readonly TileId[],
  id: TileId,
  direction: 'up' | 'down',
  listed: Iterable<TileId>,
): TileId[] {
  const shown = new Set(listed);
  const rows = order.filter((t) => shown.has(t));
  const from = rows.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= rows.length) return [...order];
  [rows[from], rows[to]] = [rows[to], rows[from]];
  return placeListed(order, rows);
}

/** The editor's names for the tiles. */
export const TILE_LABELS: Record<TileId, string> = {
  recommend: 'Recommend across media',
  'cat:books': CATEGORIES.books.label,
  'cat:movies': CATEGORIES.movies.label,
  'cat:anime': CATEGORIES.anime.label,
  'cat:games': CATEGORIES.games.label,
  overview: 'Overview',
  'cat:tv': CATEGORIES.tv.label,
  'cat:manga': CATEGORIES.manga.label,
  'cat:music': CATEGORIES.music.label,
  'now-consuming': 'Now consuming',
  'coming-up': 'Coming up',
  goals: 'Goals',
  favourites: 'Favorites',
};
