// The dashboard's tile ids (prefs.dashboard.order / .hidden), in today's
// default order: Recommend across media, the section tiles around the
// overview, Now consuming, Coming up, Goals, Favourites. Zod-free so client
// code can import it; prefs.ts validates patches against it.

export const TILE_IDS = [
  'recommend',
  'cat:books',
  'cat:movies',
  'cat:anime',
  'cat:games',
  'overview',
  'cat:tv',
  'cat:manga',
  'cat:music',
  'now-consuming',
  'coming-up',
  'goals',
  'favourites',
] as const;

export type TileId = (typeof TILE_IDS)[number];

export function isTileId(value: unknown): value is TileId {
  return typeof value === 'string' && (TILE_IDS as readonly string[]).includes(value);
}
