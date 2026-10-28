// ───────────────────────────────────────────────────────────────────────────
//  The dashboard's "Favourites" row (spec 1.10): the first four starred titles
//  of every visible section, in tier list order (S→F, by position); titles not
//  on the tier list come after, best score first.
// ───────────────────────────────────────────────────────────────────────────

import { NAV_ORDER, type CategorySlug } from './categories';
import { compareTierOrder, isTierEligible } from './tiers';
import type { ActivityWithMedia } from './types';

export const SHOWCASE_SIZE = 4;

const onTierList = (a: ActivityWithMedia) => a.tier !== null && isTierEligible(a.status);

/** Tier list order first, then the rest by score (unscored last), then title. */
export function compareShowcase(a: ActivityWithMedia, b: ActivityWithMedia): number {
  const ta = onTierList(a);
  const tb = onTierList(b);
  if (ta && tb) return compareTierOrder(a, b);
  if (ta !== tb) return ta ? -1 : 1;
  return (b.rating ?? -1) - (a.rating ?? -1) || a.media.title.localeCompare(b.media.title);
}

export interface ShowcaseSection {
  slug: CategorySlug;
  items: ActivityWithMedia[];
}

/**
 * Per section (navigation order, hidden ones left out), its first four
 * favourites. Sections without favourites are dropped, so an empty result
 * means the row is hidden.
 */
export function favouritesShowcase(
  list: ActivityWithMedia[],
  hidden: readonly string[] = [],
): ShowcaseSection[] {
  const out: ShowcaseSection[] = [];
  for (const slug of NAV_ORDER) {
    if (hidden.includes(slug)) continue;
    const items = list
      .filter((a) => a.category === slug && a.favorite)
      .sort(compareShowcase)
      .slice(0, SHOWCASE_SIZE);
    if (items.length > 0) out.push({ slug, items });
  }
  return out;
}
