import type { CategorySlug } from './categories';
import type { Status } from './status';
import type { Tier } from '@/lib/tiers';

// ───────────────────────────────────────────────────────────────────────────
//  Shared shapes that cross the API ↔ server-action ↔ UI boundaries.
// ───────────────────────────────────────────────────────────────────────────

/**
 * A search hit normalized across every external provider. `fields` is the EXACT
 * `create`/`update` payload for the target Prisma media table (column → value,
 * including `externalId` and `title`); the addToList action upserts it verbatim.
 */
export interface NormalizedResult {
  externalId: string;
  title: string;
  imageUrl: string | null;
  /** Secondary line: author, artist, studio, "1999 · 12 episodes", etc. */
  subtitle: string | null;
  year: number | null;
  description: string | null;
  fields: Record<string, unknown>;
}

export interface SearchResponse {
  source: string;
  results: NormalizedResult[];
  error?: string;
}

/** The shared display core every media table exposes (+ arbitrary extras). */
export interface MediaItem {
  id: string;
  externalId: string;
  title: string;
  imageUrl: string | null;
  description: string | null;
  year: number | null;
  // Category-specific extras (authors, runtime, episodes, platforms, ...).
  [key: string]: unknown;
}

/**
 * A user's activity row with its linked media flattened into `media`, so the UI
 * never has to know which of the seven relations was populated.
 */
export interface ActivityWithMedia {
  id: string;
  category: CategorySlug;
  status: Status;
  rating: number | null;
  tier: Tier | null;
  /** Position in the "Up next" queue (ascending); null = not queued. */
  queueOrder: number | null;
  elo: number;
  /** Position in the user's manual ranking (ascending); null = not ranked. */
  rankOrder: number | null;
  favorite: boolean;
  notes: string | null;
  /** The franchise / IP this title is grouped under, if any. */
  franchise: FranchiseRef | null;
  /** True when the user set the franchise by hand (auto-detection won't move it). */
  franchiseLocked: boolean;
  createdAt: string; // ISO string (serialized for client components)
  updatedAt: string;
  media: MediaItem;
}

/** Lightweight franchise info carried on each activity. */
export interface FranchiseRef {
  id: string;
  name: string;
  imageUrl: string | null;
  rating: number | null;
}

/** A franchise with all of its member titles (for the Franchises page). */
export interface FranchiseWithMembers extends FranchiseRef {
  notes: string | null;
  rankOrder: number | null;
  members: ActivityWithMedia[];
}

/**
 * What a category view renders: a single title, or several titles of the same
 * franchise collapsed into one expandable group.
 */
export type DisplayUnit =
  | { kind: 'item'; activity: ActivityWithMedia }
  | { kind: 'group'; franchise: FranchiseRef; members: ActivityWithMedia[] };

/**
 * Turn a list into display units. With `group` on, titles sharing a franchise
 * (2+ of them in this list) collapse into one unit placed where the first of
 * them appeared, so the current sort order is kept.
 */
export function toDisplayUnits(items: ActivityWithMedia[], group: boolean): DisplayUnit[] {
  if (!group) return items.map((activity) => ({ kind: 'item', activity }));
  const counts = new Map<string, number>();
  for (const a of items) {
    if (a.franchise) counts.set(a.franchise.id, (counts.get(a.franchise.id) ?? 0) + 1);
  }
  const emitted = new Set<string>();
  const out: DisplayUnit[] = [];
  for (const a of items) {
    const f = a.franchise;
    if (f && (counts.get(f.id) ?? 0) >= 2) {
      if (emitted.has(f.id)) continue;
      emitted.add(f.id);
      out.push({ kind: 'group', franchise: f, members: items.filter((x) => x.franchise?.id === f.id) });
    } else {
      out.push({ kind: 'item', activity: a });
    }
  }
  return out;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export type ViewMode = 'grid' | 'list' | 'compact';

export type RoastMode = 'roast' | 'recommend';

export interface Matchup {
  /** Shared whole-number score for a same-rating duel; null for a ranking-neighbour duel. */
  rating: number | null;
  /** 1-based ranks of `a` and `b` when the duel comes from the manual ranking. */
  ranks?: [number, number];
  a: ActivityWithMedia;
  b: ActivityWithMedia;
}
