// The stats charts' categorical palette as plain hex (light steps), for places
// that can't use the --viz-* CSS tokens: the year PNG is always drawn on white.
// Slot order = navigation order of the sections (src/lib/categories.ts).

import { NAV_ORDER, type CategorySlug } from '@/lib/categories';

export const VIZ_LIGHT_HEX = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'] as const;

/** A section's light-mode chart colour. */
export const sectionHex = (slug: CategorySlug): string => VIZ_LIGHT_HEX[NAV_ORDER.indexOf(slug)] ?? VIZ_LIGHT_HEX[0];

/** A section's chart colour as the theme-aware CSS token (light and dark steps). */
export const sectionVar = (slug: CategorySlug): string => `var(--viz-${Math.max(0, NAV_ORDER.indexOf(slug)) + 1})`;
