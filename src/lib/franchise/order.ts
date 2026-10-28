// ───────────────────────────────────────────────────────────────────────────
//  Watch order inside a franchise (spec 4.7). Pure and client-safe.
//
//  - release: by release date (YYYY-MM-DD), then year, then title; titles
//    with neither go last.
//  - manual:  by the user's drag order (`franchiseOrder`); titles never
//    placed by hand follow in release order.
//
//  A title is "settled" once it is finished, retired or dropped
//  (FINISHED_STATUSES): nothing still to do there. The franchise's "Next
//  up" is its first unsettled title; a queued title gets a "Next in
//  {franchise}" chip while an earlier title of the franchise is unsettled.
// ───────────────────────────────────────────────────────────────────────────

import { FINISHED_STATUSES, type Status } from '@/lib/status';

export const ORDER_MODES = ['release', 'manual'] as const;
export type OrderMode = (typeof ORDER_MODES)[number];

export const isOrderMode = (v: unknown): v is OrderMode => v === 'release' || v === 'manual';

/** What ordering needs from a member. */
export interface OrderMember {
  id: string;
  status: Status;
  franchiseOrder?: number | null;
  media: { title: string; year: number | null; releaseDate?: unknown };
}

const releaseKey = (m: OrderMember): string | null => {
  const d = m.media.releaseDate;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return m.media.year != null ? `${String(m.media.year).padStart(4, '0')}-99-99` : null;
};

/** Release order: date (or year), unknowns last, then title, then id. */
export function byRelease(a: OrderMember, b: OrderMember): number {
  const ka = releaseKey(a);
  const kb = releaseKey(b);
  if (ka !== kb) {
    if (ka === null) return 1;
    if (kb === null) return -1;
    return ka < kb ? -1 : 1;
  }
  return a.media.title.localeCompare(b.media.title) || a.id.localeCompare(b.id);
}

/** The members in the franchise's order (a new array). */
export function orderFranchiseMembers<T extends OrderMember>(members: readonly T[], mode: string): T[] {
  const out = [...members];
  if (mode !== 'manual') return out.sort(byRelease);
  return out.sort((a, b) => {
    const oa = a.franchiseOrder ?? null;
    const ob = b.franchiseOrder ?? null;
    if (oa !== null && ob !== null && oa !== ob) return oa - ob;
    if (oa !== null && ob === null) return -1;
    if (oa === null && ob !== null) return 1;
    return byRelease(a, b);
  });
}

export const isSettled = (status: Status): boolean => FINISHED_STATUSES.includes(status);

/** The franchise's next title to get to: the first unsettled one in order, or null. */
export function nextInFranchise<T extends OrderMember>(ordered: readonly T[]): T | null {
  return ordered.find((m) => !isSettled(m.status)) ?? null;
}

/** The unsettled titles ordered before `activityId` (empty when it isn't a member). */
export function earlierUnfinished<T extends OrderMember>(ordered: readonly T[], activityId: string): T[] {
  const at = ordered.findIndex((m) => m.id === activityId);
  if (at <= 0) return [];
  return ordered.slice(0, at).filter((m) => !isSettled(m.status));
}

/** Up next's chip for a queued title: its franchise and the title to get to first. */
export interface QueueHint {
  franchise: string;
  title: string;
}
