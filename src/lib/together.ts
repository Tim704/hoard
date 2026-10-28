// ───────────────────────────────────────────────────────────────────────────
//  Watch together (spec 5.8). Pure: the opt-in gate and the overlap ranking.
//
//  Privacy (G2): comparing needs BOTH users to have `compareOptIn` on. The
//  overlap holds only shared catalogue rows and each side's queue position;
//  nothing else of the other user (other titles, scores, notes) ever leaves
//  the server.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';

/** May `me` compare with `other`? Both opted in, and not the same user. */
export function canCompare(
  me: { id: string; compareOptIn: boolean } | null,
  other: { id: string; compareOptIn: boolean } | null,
): boolean {
  return Boolean(me && other && me.id !== other.id && me.compareOptIn === true && other.compareOptIn === true);
}

/** One PLANNED title in a user's section queue: the catalogue row and its 1-based position. */
export interface QueueSlot {
  slug: CategorySlug;
  mediaId: string;
  position: number;
}

export interface OverlapEntry {
  slug: CategorySlug;
  mediaId: string;
  myPosition: number;
  theirPosition: number;
}

/**
 * Titles both users have queued (the same catalogue row in the same section),
 * best first: lowest combined queue position, then the lower of the two
 * positions, then section and row id (deterministic).
 */
export function rankOverlap(mine: QueueSlot[], theirs: QueueSlot[]): OverlapEntry[] {
  const key = (s: QueueSlot) => `${s.slug}\u0000${s.mediaId}`;
  const theirMap = new Map<string, number>();
  for (const s of theirs) {
    const k = key(s);
    if (!theirMap.has(k) || s.position < theirMap.get(k)!) theirMap.set(k, s.position);
  }
  const seen = new Set<string>();
  const out: OverlapEntry[] = [];
  for (const s of mine) {
    const k = key(s);
    const theirPosition = theirMap.get(k);
    if (theirPosition === undefined || seen.has(k)) continue;
    seen.add(k);
    out.push({ slug: s.slug, mediaId: s.mediaId, myPosition: s.position, theirPosition });
  }
  return out.sort(
    (a, b) =>
      a.myPosition + a.theirPosition - (b.myPosition + b.theirPosition) ||
      Math.min(a.myPosition, a.theirPosition) - Math.min(b.myPosition, b.theirPosition) ||
      a.slug.localeCompare(b.slug) ||
      a.mediaId.localeCompare(b.mediaId),
  );
}
