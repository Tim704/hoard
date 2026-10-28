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
  needsTasteRefresh,
  parseTasteProfile,
  type TasteProfile,
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

/** The newest change in the user's history: an activity event or a diary entry. */
async function lastActivityAt(userId: string): Promise<Date | null> {
  const [event, diary] = await Promise.all([
    prisma.activityEvent.findFirst({ where: { userId }, orderBy: { at: 'desc' }, select: { at: true } }),
    prisma.diaryEntry.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const times = [event?.at, diary?.createdAt].filter((d): d is Date => d instanceof Date);
  return times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
}

/**
 * Rebuild the profile when it is missing or something happened since it was
 * built. Returns what happened, for the job's tally.
 */
export async function refreshTasteProfileIfStale(userId: string): Promise<'built' | 'unchanged' | 'too-few'> {
  const [row, last] = await Promise.all([
    prisma.tasteProfile.findUnique({ where: { userId }, select: { updatedAt: true } }),
    lastActivityAt(userId),
  ]);
  if (!needsTasteRefresh(row?.updatedAt ?? null, last)) return 'unchanged';
  const res = await buildTasteProfile(userId);
  return res.ok ? 'built' : 'too-few';
}

export interface RecommendInput {
  seeds: RecommendSeed[];
  sections: CategorySlug[];
  library: LibraryTitle[];
  profile: TasteProfile | null;
}

/** What 7.1 sends and filters against: S/A titles of visible sections, the library index, the profile. */
export async function getRecommendInput(userId: string): Promise<RecommendInput> {
  const prefs = await getPrefs(userId);
  const sections = NAV_ORDER.filter((s) => !prefs.hiddenSections.includes(s));
  const [titles, library, stored] = await Promise.all([
    loadStatTitles(userId, prefs),
    getLibraryIndex(userId),
    getTasteProfile(userId),
  ]);
  const seeds: RecommendSeed[] = [];
  for (const t of titles) {
    if (t.tier !== 'S' && t.tier !== 'A') continue;
    seeds.push({ category: t.category, title: t.media.title, year: t.media.year, tier: t.tier, rating: t.rating });
  }
  // Every section's titles (hidden ones too) count as "already in the library".
  return { seeds, sections, library, profile: stored?.profile ?? null };
}
