// The slice of `prefs` that client components see (no tokens or account ids).
// Kept free of zod and the time-zone table so every page's client bundle stays
// small; src/lib/prefs.ts builds it from the parsed prefs.

import type { CategorySlug } from '@/lib/categories';
import type { LayoutId } from '@/lib/layouts';
import type { ScoreFormat } from '@/lib/rating';

export type TitleLanguage = 'english' | 'romaji' | 'native';
export type HideableSection = CategorySlug | 'franchises';

/** How a title opens: the short popup, or its own full page. */
export const TITLE_VIEWS = ['popup', 'page'] as const;
export type TitleView = (typeof TITLE_VIEWS)[number];
export const TITLE_VIEW_LABELS: Record<TitleView, string> = { popup: 'Popup', page: 'Full page' };

export interface DisplayPrefs {
  region: string | null;
  timeZone: string | null;
  scoreFormat: ScoreFormat;
  titleLanguage: TitleLanguage;
  weekStart: number;
  hiddenSections: HideableSection[];
  layout: LayoutId;
  titleView: TitleView;
}

/** Must equal toDisplayPrefs(parsePrefs({})) — pinned by prefs.test.ts. */
export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  region: null,
  timeZone: null,
  scoreFormat: 'ten',
  titleLanguage: 'english',
  weekStart: 1,
  hiddenSections: [],
  layout: 'classic',
  titleView: 'popup',
};
