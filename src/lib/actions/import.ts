'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Import server actions (spec 2.1–2.3). The browser parses files into
//  ImportRows and drives the pipeline one call at a time:
//
//    fetchAniListRows(username)        AniList lists → rows (keyless API)
//    fetchTraktRows(username)          Trakt profile → rows (TRAKT_CLIENT_ID)
//    matchImportRows(rows ≤ 10)        candidates + confidence per row
//    commitImportRows(rows ≤ 20, …)    add / update the reviewed rows
//    groupImportedFranchises(ids ≤ 10) resolve the new titles' franchises
//    finishImport()                    regroup once, refresh every page
//
//  Calls are sequential (never parallel: Up next positions are appended in
//  order). Every action authenticates and validates its input with zod.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { importPushTargets } from '@/lib/anilist-sync';
import { aniListPushConfigured, queueAniListPush } from '@/lib/anilist-sync-server';
import { getLink } from '@/lib/external-links';
import { isLookupSkipped } from '@/lib/apis/details';
import { providerFetch } from '@/lib/apis/http';
import { getPrefs } from '@/lib/data-prefs';
import { effectiveTimeZone } from '@/lib/prefs';
import { CATEGORY_LIST, CATEGORY_SLUGS, type CategorySlug } from '@/lib/categories';
import { resolveMediaRow } from '@/lib/franchise/auto';
import { syncUserFranchises } from '@/lib/franchise/sync';
import { matchRows } from '@/lib/import/matcher';
import { commitRow, serverMatchDeps } from '@/lib/import/server';
import { readAniListLists } from '@/lib/import/anilist-fetch';
import { mapAniListCollection, validAniListUser } from '@/lib/import/sources/anilist';
import {
  mapTraktData,
  TRAKT_API,
  TRAKT_PATHS,
  traktErrorMessage,
  traktUserFromInput,
  validTraktUser,
  type TraktData,
} from '@/lib/import/sources/trakt';
import {
  COMMIT_CHUNK,
  IMPORT_SOURCES,
  MATCH_CHUNK,
  MAX_IMPORT_ROWS,
  type CommitRowOutcome,
  type ImportRow,
  type RowMatch,
} from '@/lib/import/types';
import { isYmd } from '@/lib/release';
import { NormalizedResultSchema } from '@/lib/result-schema';
import { requireUser } from '@/lib/session';
import { STATUSES } from '@/lib/status';
import { publicError } from '@/lib/action-error';
import { takeActionRate } from '@/lib/rate-limit';

const Day = z.string().refine(isYmd, 'Not a day.');
const Slug = z.enum(CATEGORY_SLUGS as [CategorySlug, ...CategorySlug[]]);
const Status = z.enum(STATUSES);
const Source = z.enum(IMPORT_SOURCES);
const Rating = z.number().min(0).max(10);
const Tags = z.array(z.string().trim().min(1).max(100)).max(50);
/** Provider ids are plain numbers; ISBNs 10 or 13 characters of digits (X last). */
const Id = z.string().regex(/^\d{1,20}$/);
const Isbn = z.string().regex(/^(\d{13}|\d{9}[\dX])$/);

const DiaryEntry = z.object({
  date: Day,
  rating: Rating.optional(),
  rewatch: z.boolean(),
  review: z.string().max(20_000).optional(),
});

const ImportRowSchema = z.object({
  source: Source,
  category: Slug,
  title: z.string().trim().min(1).max(500),
  year: z.number().int().min(1000).max(3000).optional(),
  author: z.string().max(300).optional(),
  ids: z.object({
    tmdb: Id.optional(),
    imdb: z.string().regex(/^tt\d{1,12}$/).optional(),
    mal: Id.optional(),
    anilist: Id.optional(),
    isbn: Isbn.optional(),
    isbn10: Isbn.optional(),
    igdb: Id.optional(),
    steam: Id.optional(),
  }),
  externalId: z.string().max(200).optional(),
  status: Status,
  rating: Rating.optional(),
  finishedOn: Day.optional(),
  startedOn: Day.optional(),
  rewatchCount: z.number().int().min(0).max(10_000).optional(),
  review: z.string().max(20_000).optional(),
  tags: Tags.optional(),
  progress: z.number().int().min(0).max(1_000_000).optional(),
  notes: z.string().max(5000).optional(),
  favourite: z.boolean().optional(),
  diary: z.array(DiaryEntry).max(1000).optional(),
  playtimeMinutes: z.number().int().min(0).max(10_000_000).optional(),
});

const CommitRowSchema = z.object({
  category: Slug,
  source: Source,
  result: NormalizedResultSchema,
  status: Status,
  rating: Rating.nullable().optional(),
  finishedOn: Day.nullable().optional(),
  startedOn: Day.nullable().optional(),
  progress: z.number().int().min(0).max(1_000_000).nullable().optional(),
  tags: Tags.optional(),
  notes: z.string().max(5000).nullable().optional(),
  favourite: z.boolean().optional(),
  rewatchCount: z.number().int().min(0).max(10_000).nullable().optional(),
  review: z.string().max(20_000).nullable().optional(),
  diary: z.array(DiaryEntry).max(1000).optional(),
  playtimeMinutes: z.number().int().min(0).max(10_000_000).nullable().optional(),
  steamAppId: z.number().int().min(1).max(4_294_967_295).nullable().optional(),
}).refine(
  // Steam data only ever comes with Steam rows (8.1).
  (r) => r.source === 'steam' || (r.playtimeMinutes == null && r.steamAppId == null),
  'Only Steam rows carry playtime or a Steam app id.',
);

const fail = (err: unknown, fallback: string) => (publicError(err, fallback));

/**
 * Read a public AniList profile's anime and manga lists into import rows.
 * An unknown or private user is a friendly error, as is AniList being down.
 */
export async function fetchAniListRows(
  username: string,
): Promise<{ ok: boolean; error?: string; rows?: ImportRow[]; skipped?: number; cut?: number }> {
  try {
    await requireUser();
    const user = typeof username === 'string' ? username.trim() : '';
    if (!validAniListUser(user)) return { ok: false, error: 'That is not an AniList username.' };

    const read = await readAniListLists(user);
    if (!read.ok) return { ok: false, error: read.error };
    const rows: ImportRow[] = [];
    let skipped = 0;
    for (const type of ['ANIME', 'MANGA'] as const) {
      const mapped = mapAniListCollection(read.lists[type], type);
      rows.push(...mapped.rows);
      skipped += mapped.skipped;
    }
    // More than one import's worth: send the first part and say how many were left out.
    return { ok: true, rows: rows.slice(0, MAX_IMPORT_ROWS), skipped, cut: Math.max(0, rows.length - MAX_IMPORT_ROWS) };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not read that AniList profile.') };
  }
}

/**
 * Read a public Trakt profile (watched movies and shows, ratings, watchlist)
 * into import rows. Needs TRAKT_CLIENT_ID; without it, or for an unknown or
 * private profile, a friendly error (spec G4).
 */
export async function fetchTraktRows(
  username: string,
): Promise<{ ok: boolean; error?: string; rows?: ImportRow[]; skipped?: number; cut?: number }> {
  try {
    const me = await requireUser();
    const clientId = process.env.TRAKT_CLIENT_ID;
    if (!clientId) {
      return { ok: false, error: "Trakt isn't configured on this server. Ask the owner to add TRAKT_CLIENT_ID." };
    }
    const user = traktUserFromInput(typeof username === 'string' ? username : '');
    if (!validTraktUser(user)) return { ok: false, error: 'That is not a Trakt username.' };

    const data: TraktData = {
      watchedMovies: [],
      watchedShows: [],
      ratingsMovies: [],
      ratingsShows: [],
      watchlistMovies: [],
      watchlistShows: [],
    };
    for (const { key, path } of TRAKT_PATHS) {
      const res = await providerFetch(`${TRAKT_API}/users/${encodeURIComponent(user)}/${path}`, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Hoard/1.0',
          'trakt-api-version': '2',
          'trakt-api-key': clientId,
        },
      }).catch(() => null);
      if (!res) return { ok: false, error: 'Trakt did not answer in time. Try again later.' };
      if (!res.ok) return { ok: false, error: traktErrorMessage(res.status, user) };
      const json = await res.json().catch(() => null);
      if (!Array.isArray(json)) return { ok: false, error: 'Trakt sent something unexpected. Try again later.' };
      data[key] = json as never;
    }
    const timeZone = effectiveTimeZone(await getPrefs(me.id));
    const mapped = mapTraktData(data, timeZone);
    return {
      ok: true,
      rows: mapped.rows.slice(0, MAX_IMPORT_ROWS),
      skipped: mapped.skipped,
      cut: Math.max(0, mapped.rows.length - MAX_IMPORT_ROWS),
    };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not read that Trakt profile.') };
  }
}

/** Candidates and a confidence for up to MATCH_CHUNK rows. */
export async function matchImportRows(
  rows: ImportRow[],
): Promise<{ ok: boolean; error?: string; matches?: RowMatch[] }> {
  try {
    const user = await requireUser();
    const limited = takeActionRate('matchImportRows', user.id);
    if (limited) return { ok: false, error: limited };
    const parsed = z.array(ImportRowSchema).max(MATCH_CHUNK).safeParse(rows);
    if (!parsed.success) return { ok: false, error: `Send at most ${MATCH_CHUNK} valid rows at a time.` };
    const matches = await matchRows(parsed.data as ImportRow[], serverMatchDeps(user.id));
    return { ok: true, matches };
  } catch (err) {
    return { ok: false, error: fail(err, 'Matching failed.') };
  }
}

/**
 * Add (or, with `updateExisting`, update) up to COMMIT_CHUNK reviewed rows,
 * one after another. Franchise grouping is left to groupImportedFranchises.
 */
export async function commitImportRows(
  rows: unknown,
  opts: { updateExisting: boolean; importTotal?: number },
): Promise<{ ok: boolean; error?: string; outcomes?: CommitRowOutcome[]; aniListSkipped?: boolean }> {
  try {
    const user = await requireUser();
    const limited = takeActionRate('commitImportRows', user.id);
    if (limited) return { ok: false, error: limited };
    const parsed = z.array(CommitRowSchema).max(COMMIT_CHUNK).safeParse(rows);
    if (!parsed.success) return { ok: false, error: `Send at most ${COMMIT_CHUNK} valid rows at a time.` };
    const updateExisting = opts?.updateExisting === true;
    const outcomes: CommitRowOutcome[] = [];
    for (const row of parsed.data) outcomes.push(await commitRow(user.id, row, { updateExisting }));
    // 8.2: imported anime / manga go to AniList too (after their commit),
    // unless the import is large (it would hold the shared push queue).
    const total = typeof opts?.importTotal === 'number' ? opts.importTotal : null;
    const push = importPushTargets(parsed.data, outcomes, total);
    for (const t of push.targets) queueAniListPush(user.id, t.activityId, t.category);
    const aniListSkipped = push.skippedLarge && aniListPushConfigured() && Boolean((await getLink(user.id, 'anilist'))?.token);
    return { ok: true, outcomes, ...(aniListSkipped && { aniListSkipped }) };
  } catch (err) {
    return { ok: false, error: fail(err, 'Import failed.') };
  }
}

/**
 * Resolve the franchises of up to 10 newly imported titles (the user's own
 * activities only), pacing the provider calls. The client loops over the new
 * ids, then calls finishImport once.
 */
export async function groupImportedFranchises(
  activityIds: unknown,
): Promise<{ ok: boolean; error?: string; resolved?: number }> {
  try {
    const user = await requireUser();
    const parsed = z.array(z.string().min(1).max(64)).max(10).safeParse(activityIds);
    if (!parsed.success) return { ok: false, error: 'Send at most 10 titles at a time.' };
    const acts = await prisma.userMediaActivity.findMany({
      where: { id: { in: parsed.data }, userId: user.id },
    });
    let resolved = 0;
    for (const a of acts) {
      const cat = CATEGORY_LIST.find((c) => c.dbCategory === a.category);
      const mediaId = cat ? a[cat.fkField] : null;
      if (!cat || !mediaId) continue;
      const media = await (prisma as any)[cat.prismaModel].findUnique({
        where: { id: mediaId },
        select: { id: true, externalId: true, title: true, franchiseName: true },
      });
      if (!media || media.franchiseName) continue;
      if (await resolveMediaRow(cat.slug, media)) resolved++;
      // Pace provider calls (AniList in particular rate-limits aggressively).
      if (!isLookupSkipped(media.externalId)) {
        await new Promise((r) => setTimeout(r, cat.slug === 'anime' || cat.slug === 'manga' ? 800 : 250));
      }
    }
    return { ok: true, resolved };
  } catch (err) {
    return { ok: false, error: fail(err, 'Grouping failed.') };
  }
}

/** Regroup the library once after an import and refresh every page. */
export async function finishImport(): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await syncUserFranchises(user.id);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not finish the import.') };
  }
}
