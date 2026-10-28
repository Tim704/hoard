// ───────────────────────────────────────────────────────────────────────────
//  "More by the same people" (spec 5.10): the shared shapes and the pure
//  rules. Client-safe.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import type { NormalizedResult } from '@/lib/types';

/** Titles per person / studio shown in the details. */
export const MORE_BY_LIMIT = 10;
/** People looked up for movies and TV (directors first, then top-billed cast). */
export const MORE_BY_PEOPLE = 2;

export interface MoreByItem {
  slug: CategorySlug;
  result: NormalizedResult;
}

export interface MoreByGroup {
  label: string;
  items: MoreByItem[];
}

export type MoreByAnswer =
  | { status: 'ok'; groups: MoreByGroup[] }
  /** A friendly line: no key, no credits stored, provider down, nothing found. */
  | { status: 'message'; message: string };

/** The people to look up: directors (or creators) first, then the cast, each once. */
export function pickPeople(directors: readonly string[], cast: readonly string[], limit = MORE_BY_PEOPLE): string[] {
  const out: string[] = [];
  for (const name of [...directors, ...cast]) {
    const n = name?.trim();
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Trim each group to `limit` titles, leaving out the title itself and
 * whatever `excluded` says (the user's library, keyed "slug:externalId").
 * Empty groups are dropped.
 */
export function trimGroups(
  groups: readonly MoreByGroup[],
  self: { slug: CategorySlug; externalId: string },
  excluded: (slug: CategorySlug, externalId: string) => boolean,
  limit = MORE_BY_LIMIT,
): MoreByGroup[] {
  return groups
    .map((g) => ({
      label: g.label,
      items: g.items
        .filter((it) => !(it.slug === self.slug && it.result.externalId === self.externalId))
        .filter((it) => !excluded(it.slug, it.result.externalId))
        .slice(0, limit),
    }))
    .filter((g) => g.items.length > 0);
}
