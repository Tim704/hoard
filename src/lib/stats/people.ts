// ───────────────────────────────────────────────────────────────────────────
//  People (spec 6.6): your most-watched directors (TV: creators) and actors,
//  from the credits stored on finished movies and TV shows (F2). Pure and
//  client-safe.
// ───────────────────────────────────────────────────────────────────────────

import { averageScore, countsAsFinished } from './measures';
import type { StatTitle } from './types';

export interface PersonRow {
  name: string;
  /** Finished movies / shows with this person. */
  count: number;
  /** Your average score of those (rated ones), or null. */
  avgScore: number | null;
  /** A few of the titles, best score first. */
  titles: string[];
}

/**
 * The top `n` people in `field` over your finished movies and TV shows: most
 * titles, then higher average score, then name. Names match exactly after
 * trimming (the provider spells each person the same way everywhere).
 */
export function topPeople(titles: readonly StatTitle[], field: 'directors' | 'cast', n = 10): PersonRow[] {
  const groups = new Map<string, StatTitle[]>();
  for (const t of titles) {
    if ((t.category !== 'movies' && t.category !== 'tv') || !countsAsFinished(t)) continue;
    const names = new Set(t.media[field].map((s) => s.trim()).filter(Boolean));
    for (const name of names) groups.set(name, [...(groups.get(name) ?? []), t]);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({
      name,
      count: list.length,
      avgScore: averageScore(list),
      titles: [...list]
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.media.title.localeCompare(b.media.title))
        .slice(0, 3)
        .map((t) => t.media.title),
    }))
    .sort((a, b) => b.count - a.count || (b.avgScore ?? -1) - (a.avgScore ?? -1) || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, n));
}
