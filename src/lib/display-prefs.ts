// The slice of `prefs` that client components see (no tokens or account ids).
// Kept free of zod and the time-zone table so every page's client bundle stays
// small; src/lib/prefs.ts builds it from the parsed prefs.

import type { CategorySlug } from '@/lib/categories';
import type { ScoreFormat } from '@/lib/rating';

export type TitleLanguage = 'english' | 'romaji' | 'native';
export type HideableSection = CategorySlug | 'franchises';

export interface DisplayPrefs {
  region: string | null;
  timeZone: string | null;
  scoreFormat: ScoreFormat;
  titleLanguage: TitleLanguage;
  weekStart: number;
  hiddenSections: HideableSection[];
}

/** Must equal toDisplayPrefs(parsePrefs({})) — pinned by prefs.test.ts. */
export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  region: null,
  timeZone: null,
  scoreFormat: 'ten',
  titleLanguage: 'english',
  weekStart: 1,
  hiddenSections: [],
};
