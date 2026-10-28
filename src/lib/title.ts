// ───────────────────────────────────────────────────────────────────────────
//  Anime / manga title language (spec 4.9). Pure and client-safe.
//
//  Anime and manga store AniList's English, romaji and native titles next to
//  `title`. Every place that shows a title calls `displayTitle`, which picks
//  the user's preferred variant and falls back through the others (english →
//  romaji → native) to the stored `title`. Other media have no variants, so
//  they always get `title` back.
// ───────────────────────────────────────────────────────────────────────────

import type { TitleLanguage } from '@/lib/display-prefs';

export interface TitledMedia {
  title: string;
  titleEnglish?: unknown;
  titleRomaji?: unknown;
  titleNative?: unknown;
}

const FIELD: Record<TitleLanguage, 'titleEnglish' | 'titleRomaji' | 'titleNative'> = {
  english: 'titleEnglish',
  romaji: 'titleRomaji',
  native: 'titleNative',
};
const FALLBACK_ORDER: TitleLanguage[] = ['english', 'romaji', 'native'];

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** The title to show for `media` in the user's preferred language. */
export function displayTitle(media: TitledMedia, language: TitleLanguage = 'english'): string {
  const order = [language, ...FALLBACK_ORDER.filter((l) => l !== language)];
  for (const l of order) {
    const t = text(media[FIELD[l]]);
    if (t) return t;
  }
  return media.title;
}

/** Every distinct title of `media` (stored + variants), for local filtering. */
export function titleVariants(media: TitledMedia): string[] {
  const all = [media.title, media.titleEnglish, media.titleRomaji, media.titleNative]
    .map(text)
    .filter((t): t is string => t !== null);
  return [...new Set(all)];
}

/** Case-insensitive "does any title of `media` contain `query`". */
export function matchesTitle(media: TitledMedia, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return titleVariants(media).some((t) => t.toLowerCase().includes(q));
}
