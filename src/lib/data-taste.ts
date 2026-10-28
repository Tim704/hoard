// ───────────────────────────────────────────────────────────────────────────
//  Taste profile and cross-media recommendations (spec 7.1 / 7.2): server-
//  only loaders, not server actions. Everything reads ONE user's own rows
//  (G2); sections hidden in Settings stay out of both.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { NAV_ORDER, type CategorySlug } from '@/lib/categories';
import { loadStatTitles } from '@/lib/data-stats';
import { getPrefs } from '@/lib/data-prefs';
import { getLibraryIndex } from '@/lib/data-search';
import type { Prefs } from '@/lib/prefs';
import type { LibraryTitle, RecommendSeed } from '@/lib/recommend';
import {
  computeTasteProfile,
  MIN_FINISHED_FOR_PROFILE,
  parseTasteProfile,
  sameJson,
  type TasteProfile,
  withoutHidden,
} from '@/lib/stats/profile';

export interface StoredTasteProfile {
  profile: TasteProfile;
  updatedAt: Date;
}

/** The user's stored profile, or null (none yet, or an unreadable version). */
export async function getTasteProfile(userId: string): Promise<StoredTasteProfile | null> {
  const row = await prisma.tasteProfile.findUnique({ where: { userId }, select: { data: true, updatedAt: true } });
  const profile = row ? parseTasteProfile(row.data) : null;
  return row && profile ? { profile, updatedAt: row.updatedAt } : null;
}

export type BuildOutcome =
  | { ok: true; profile: TasteProfile }
  | { ok: false; finished: number };

/**
 * Compute and store the profile of `userId` when they have finished at
 * least MIN_FINISHED_FOR_PROFILE titles in their visible sections. Below
 * that nothing is written (an older profile stays).
 */
export async function buildTasteProfile(userId: string, known?: Prefs): Promise<BuildOutcome> {
  const prefs = known ?? (await getPrefs(userId));
  const profile = computeTasteProfile(await loadStatTitles(userId, prefs));
  if (profile.finished < MIN_FINISHED_FOR_PROFILE) return { ok: false, finished: profile.finished };
  await prisma.tasteProfile.upsert({
    where: { userId },
    create: { userId, data: profile },
    update: { data: profile },
  });
  return { ok: true, profile };
}

/**
 * The weekly rebuild: recompute from the current rows and settings (so
 * removals, hidden sections and new metadata are picked up) and write only
 * when the result differs from the stored profile.
 */
export async function refreshTasteProfileForJob(userId: string): Promise<'built' | 'unchanged' | 'too-few'> {
  const prefs = await getPrefs(userId);
  const [profile, row] = await Promise.all([
    loadStatTitles(userId, prefs).then(computeTasteProfile),
    prisma.tasteProfile.findUnique({ where: { userId }, select: { data: true } }),
  ]);
  if (profile.finished < MIN_FINISHED_FOR_PROFILE) return 'too-few';
  if (row && sameJson(profile, row.data)) return 'unchanged';
  await prisma.tasteProfile.upsert({ where: { userId }, create: { userId, data: profile }, update: { data: profile } });
  return 'built';
}

export interface RecommendInput {
  seeds: RecommendSeed[];
  sections: CategorySlug[];
  /** The profile without hidden sections, or null. */
  profile: TasteProfile | null;
}

/** What 7.1 sends: S/A titles of visible sections and the profile (the library index is loaded separately). */
export async function getRecommendInput(userId: string): Promise<RecommendInput> {
  const prefs = await getPrefs(userId);
  const sections = NAV_ORDER.filter((s) => !prefs.hiddenSections.includes(s));
  const [titles, stored] = await Promise.all([loadStatTitles(userId, prefs), getTasteProfile(userId)]);
  const seeds: RecommendSeed[] = [];
  for (const t of titles) {
    if (t.tier !== 'S' && t.tier !== 'A') continue;
    seeds.push({ category: t.category, title: t.media.title, year: t.media.year, tier: t.tier, rating: t.rating });
  }
  return { seeds, sections, profile: stored ? withoutHidden(stored.profile, prefs.hiddenSections) : null };
}

/** Every library title (hidden sections too) for the "already in the library" filter. */
export async function getLibraryForFilter(userId: string): Promise<LibraryTitle[]> {
  return getLibraryIndex(userId);
}
