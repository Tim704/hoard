'use server';

// ───────────────────────────────────────────────────────────────────────────
//  /anime/season (spec 5.11): one page of a season from AniList, plus which
//  of its titles the caller already has. AniList needs no key; failures come
//  back as a friendly error (G4).
// ───────────────────────────────────────────────────────────────────────────

import { fetchAnimeSeason } from '@/lib/apis/anilist';
import { parseSeasonQuery, SEASON_PAGE_SIZE } from '@/lib/anime-season';
import { libraryMarks, type LibraryMarks } from '@/lib/data-search';
import { requireUser } from '@/lib/session';
import type { ActionResult, NormalizedResult } from '@/lib/types';
import { publicError } from '@/lib/action-error';

export async function browseAnimeSeason(
  raw: unknown,
): Promise<ActionResult & { results?: NormalizedResult[]; marks?: LibraryMarks; more?: boolean }> {
  try {
    const user = await requireUser();
    const q = parseSeasonQuery(raw, new Date().getUTCFullYear() + 2);
    if (!q) return { ok: false, error: 'Pick a season and a year.' };
    let results: NormalizedResult[];
    try {
      results = await fetchAnimeSeason(q);
    } catch {
      return { ok: false, error: 'AniList could not be reached. Try again in a moment.' };
    }
    const marks = await libraryMarks(user.id, results.map((r) => ({ slug: 'anime' as const, externalId: r.externalId })));
    return { ok: true, results, marks, more: results.length === SEASON_PAGE_SIZE };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not load that season.') };
  }
}
