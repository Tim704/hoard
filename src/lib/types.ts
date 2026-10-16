import type { CategorySlug } from './categories';
import type { Status } from './status';

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
  elo: number;
  /** Position in the user's manual ranking (ascending); null = not ranked. */
  rankOrder: number | null;
  favorite: boolean;
  notes: string | null;
  createdAt: string; // ISO string (serialized for client components)
  updatedAt: string;
  media: MediaItem;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export type ViewMode = 'grid' | 'list' | 'compact';

export type RoastMode = 'roast' | 'recommend';

export interface Matchup {
  /** Shared 1–10 score for a same-rating duel; null for a ranking-neighbour duel. */
  rating: number | null;
  /** 1-based ranks of `a` and `b` when the duel comes from the manual ranking. */
  ranks?: [number, number];
  a: ActivityWithMedia;
  b: ActivityWithMedia;
}
