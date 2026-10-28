// ───────────────────────────────────────────────────────────────────────────
//  The server half of the import pipeline (spec 2.1): the real database and
//  provider calls behind `matchRows`, and the commit of reviewed rows.
//  Deliberately NOT a 'use server' module: everything here trusts its
//  `userId`; src/lib/actions/import.ts authenticates and validates first.
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { enrichResult, searchProvider, type EnrichedResult } from '@/lib/apis';
import { fetchAniListByIds, fetchAniListByMalIds } from '@/lib/apis/anilist';
import { searchBooksByIsbn, searchBooksByTitle } from '@/lib/apis/books';
import { detailsConfigured, isLookupSkipped } from '@/lib/apis/details';
import { searchMovies } from '@/lib/apis/tmdb';
import { getCategory, type CategorySlug } from '@/lib/categories';
import { entersFinished, writeImportDiary } from '@/lib/diary';
import { recordEvent, recordEvents } from '@/lib/events';
import { addMediaForUser, newManualExternalId } from '@/lib/library/add';
import { manualResult, parseManualInput } from '@/lib/manual';
import type { Status } from '@/lib/status';
import type { NormalizedResult } from '@/lib/types';

import { dayToDate } from './fields';
import type { MatchDeps } from './matcher';
import { NEW_MANUAL_ID, type CommitRow, type CommitRowOutcome, type InLibrary } from './types';
import { planImportUpdate } from './update';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A stored catalogue row in the shape the review screen shows. */
function rowToResult(row: Record<string, any>): NormalizedResult {
  const year = typeof row.year === 'number' ? row.year : null;
  const by =
    (Array.isArray(row.authors) && row.authors.length && row.authors.join(', ')) ||
    (typeof row.artist === 'string' && row.artist) ||
    (typeof row.studio === 'string' && row.studio) ||
    null;
  return {
    externalId: row.externalId,
    title: row.title,
    imageUrl: row.imageUrl ?? null,
    subtitle: [by, year].filter(Boolean).join(' · ') || null,
    year,
    description: row.description ?? null,
    // The row exists, so the add only links it; nothing here is written.
    fields: { externalId: row.externalId, title: row.title },
  };
}

/** The real `MatchDeps` for one user. */
export function serverMatchDeps(userId: string): MatchDeps {
  return {
    async catalogue(slug, externalIds) {
      const cat = getCategory(slug)!;
      const rows: any[] = await (prisma as any)[cat.prismaModel].findMany({
        where: { externalId: { in: [...new Set(externalIds)] } },
      });
      return new Map(rows.map((r) => [r.externalId as string, rowToResult(r)]));
    },
    async ownManual(slug) {
      const cat = getCategory(slug)!;
      const rows: any[] = await prisma.userMediaActivity.findMany({
        where: { userId, category: cat.dbCategory, [cat.prismaModel]: { is: { externalId: { startsWith: 'manual:' } } } } as any,
        select: { [cat.prismaModel]: true } as any,
      });
      return rows.map((r) => rowToResult(r[cat.prismaModel]));
    },
    async library(slug, externalIds) {
      const cat = getCategory(slug)!;
      const rows: any[] = await prisma.userMediaActivity.findMany({
        where: {
          userId,
          category: cat.dbCategory,
          [cat.prismaModel]: { is: { externalId: { in: [...new Set(externalIds)] } } },
        } as any,
        select: { id: true, status: true, [cat.prismaModel]: { select: { externalId: true } } } as any,
      });
      return new Map<string, InLibrary>(
        rows.map((r) => [r[cat.prismaModel].externalId as string, { activityId: r.id, status: r.status as Status }]),
      );
    },
    configured: detailsConfigured,
    search: searchProvider,
    searchMovies,
    booksByIsbn: searchBooksByIsbn,
    booksByTitle: searchBooksByTitle,
    aniListByIds: fetchAniListByIds,
    aniListByMalIds: fetchAniListByMalIds,
    pause: sleep,
  };
}

export interface CommitOptions {
  updateExisting: boolean;
}

const day = (ymd: string | null | undefined) => (ymd ? dayToDate(ymd) : null);

/**
 * Write one reviewed row: add the title (one `import` event, no franchise
 * regroup — the client runs that once at the end), or, when the user already
 * has it and asked for it, update it. Never throws.
 */
export async function commitRow(userId: string, row: CommitRow, opts: CommitOptions): Promise<CommitRowOutcome> {
  const slug = row.category;
  const cat = getCategory(slug);
  if (!cat) return { outcome: 'failed', error: 'Unknown section.' };
  try {
    let result: NormalizedResult = row.result;
    let metaFetchedAt: Date | null = null;
    let seasons: EnrichedResult['seasons'] = null;
    const ext = result.externalId;

    if (ext === NEW_MANUAL_ID) {
      // A hand-made entry from a Hoard CSV: a fresh manual row, as in the Add dialog.
      const parsed = parseManualInput(slug, { title: result.title, year: result.year ? String(result.year) : '' });
      if (!parsed.ok) return { outcome: 'failed', error: parsed.error };
      result = manualResult(newManualExternalId(), parsed.fields);
    } else if (ext.startsWith('manual:')) {
      // Someone's hand-made row: only ever the user's own, which they already have.
      const mine = await serverMatchDeps(userId).library(slug, [ext]);
      if (!mine.has(ext)) return { outcome: 'failed', error: 'Could not add that item.' };
    } else {
      const stored = await (prisma as any)[cat.prismaModel].findUnique({ where: { externalId: ext }, select: { id: true } });
      if (!stored && !isLookupSkipped(ext)) {
        // A new catalogue row: the provider, not the client, supplies its details.
        const enriched = await enrichResult(slug, result);
        result = enriched.result;
        metaFetchedAt = enriched.metaFetchedAt;
        seasons = enriched.seasons;
        // AniList allows ~30–90 requests a minute; leave room between lookups.
        if (slug === 'anime' || slug === 'manga') await sleep(700);
      }
    }

    const meta = { source: row.source } satisfies Prisma.InputJsonValue;
    const { activityId, existing } = await addMediaForUser(userId, slug, result, {
      status: row.status,
      rating: row.rating ?? null,
      // An import without a finish day leaves it unknown rather than "today".
      finishedAt: day(row.finishedOn),
      startedAt: day(row.startedOn),
      progress: row.progress ?? null,
      tags: row.tags ?? [],
      notes: row.notes ?? null,
      favorite: row.favourite === true,
      skipFranchise: true,
      skipDiary: true,
      // The row's diary days (and a review no entry holds) land in the same
      // transaction as the new activity.
      afterCreate: (tx, id) => writeImportDiary(tx, userId, id, row),
      eventKind: 'import',
      eventMeta: meta,
      metaFetchedAt,
      seasons,
    });
    if (!existing) return { outcome: 'added', activityId };
    if (!opts.updateExisting) return { outcome: 'unchanged', activityId };
    const changed = await updateExisting(userId, activityId, row);
    return { outcome: changed ? 'updated' : 'unchanged', activityId };
  } catch (err) {
    return { outcome: 'failed', error: err instanceof Error ? err.message : 'Import failed.' };
  }
}

/**
 * Apply an import row to an activity the user already has, with the same
 * events updateActivity / setProgress record (plus one `import` event), in a
 * transaction, and add its diary days the activity doesn't have yet (imports
 * never log a "today" entry) plus a review no entry holds to the notes.
 * True when something changed.
 */
async function updateExisting(userId: string, activityId: string, row: CommitRow): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const a = await tx.userMediaActivity.findUnique({ where: { id: activityId } });
    if (!a || a.userId !== userId) return false;
    const plan = planImportUpdate(
      { userId, activityId },
      {
        status: a.status as Status,
        rating: a.rating,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        progress: a.progress,
        tags: a.tags ?? [],
        favorite: a.favorite,
      },
      {
        status: row.status,
        rating: row.rating ?? null,
        startedAt: day(row.startedOn),
        finishedAt: day(row.finishedOn),
        progress: row.progress ?? null,
        tags: row.tags ?? [],
        favorite: row.favourite === true,
      },
    );
    // The row's dated log (or finish day) joins the diary, skipping known days.
    const logged = await writeImportDiary(tx, userId, activityId, row);
    if (Object.keys(plan.patch).length === 0) return logged;

    const data: Prisma.UserMediaActivityUpdateInput = { ...plan.patch };
    if (plan.queue === 'leave') data.queueOrder = null;
    // Finishing (or dropping) ends a repeat run (3.1).
    if (a.rewatching && entersFinished(a.status, plan.patch.status)) data.rewatching = false;
    await tx.userMediaActivity.update({ where: { id: activityId }, data });
    if (plan.events.length) await recordEvents(tx, plan.events);
    await recordEvent(tx, {
      userId,
      activityId,
      kind: 'import',
      to: row.status,
      meta: { source: row.source, updated: true },
    });
    return true;
  });
}

/** The slugs a set of rows touches (to revalidate their pages). */
export function touchedSlugs(rows: { category: CategorySlug }[]): CategorySlug[] {
  return [...new Set(rows.map((r) => r.category))];
}
