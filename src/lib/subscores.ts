// ───────────────────────────────────────────────────────────────────────────
//  Sub-scores (spec 4.10): optional per-aspect scores on one title, each 0–10
//  with one decimal, stored in UserMediaActivity.subScores as { key: score }.
//  The aspects depend on the medium. Pure and client-safe.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import { normalizeRating } from '@/lib/rating';

export const SUBSCORE_LABELS = {
  story: 'Story',
  characters: 'Characters',
  visuals: 'Visuals',
  audio: 'Audio',
  enjoyment: 'Enjoyment',
  gameplay: 'Gameplay',
  writing: 'Writing',
  songs: 'Songs',
  production: 'Production',
} as const;

export type SubScoreKey = keyof typeof SUBSCORE_LABELS;
export type SubScores = Partial<Record<SubScoreKey, number>>;

const SCREEN: readonly SubScoreKey[] = ['story', 'characters', 'visuals', 'audio', 'enjoyment'];

/** The aspects per section, in display order. */
export const SUBSCORE_KEYS: Record<CategorySlug, readonly SubScoreKey[]> = {
  movies: SCREEN,
  tv: SCREEN,
  anime: SCREEN,
  games: ['gameplay', 'story', 'visuals', 'audio', 'enjoyment'],
  books: ['writing', 'story', 'characters', 'enjoyment'],
  manga: ['writing', 'story', 'characters', 'enjoyment'],
  music: ['songs', 'production', 'enjoyment'],
};

/**
 * Validated sub-scores for a section: only that section's keys, each a 0–10
 * score rounded to one decimal; anything else is dropped. Never throws.
 */
export function parseSubScores(slug: CategorySlug, raw: unknown): SubScores {
  const out: SubScores = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const keys = SUBSCORE_KEYS[slug] ?? [];
  for (const key of keys) {
    if (!Object.hasOwn(raw, key)) continue;
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v !== 'number') continue;
    const score = normalizeRating(v);
    if (score !== null) out[key] = score;
  }
  return out;
}

/** The mean of the given sub-scores, rounded to one decimal; null when there are none. */
export function subScoreAverage(scores: SubScores | null | undefined): number | null {
  const values = Object.values(scores ?? {}).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return null;
  return normalizeRating(values.reduce((s, v) => s + v, 0) / values.length);
}
