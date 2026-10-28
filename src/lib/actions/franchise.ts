'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Franchise server actions — detection, editing, manual (re)assignment,
//  merging and the franchise ranking. Every action is scoped to the user and
//  verifies ownership before writing.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { normalizeRating } from '@/lib/rating';
import { requireUser } from '@/lib/session';
import { resolveMediaRow } from '@/lib/franchise/auto';
import { normalizeTitle } from '@/lib/franchise/normalize';
import { isOrderMode } from '@/lib/franchise/order';
import { syncUserFranchises } from '@/lib/franchise/sync';
import { anilistQuery } from '@/lib/apis/anilist';
import { fetchFranchiseGames, igdbConfigured } from '@/lib/apis/igdb';
import { fetchCollectionParts, tmdbConfigured } from '@/lib/apis/tmdb';
import {
  aniListStart,
  GRAPH_FIELDS,
  missingTitles,
  nodesToTitles,
  providerKeys,
  walkAniList,
  type AniListGraphNode,
  type MissingTitle,
} from '@/lib/franchise/missing';
import type { ActionResult } from '@/lib/types';
import { publicError } from '@/lib/action-error';
import { takeActionRate } from '@/lib/rate-limit';

/** Refresh every page that shows franchise data. */
function revalidateAll() {
  revalidatePath('/', 'layout');
}

function fail(err: unknown, fallback: string): ActionResult {
  return { ok: false, error: publicError(err, fallback) };
}

/** Time budget per detection step, well under the tunnel's request timeout. */
const STEP_BUDGET_MS = 20_000;

export interface DetectResult extends ActionResult {
  resolved: number;
  remaining: number;
  groups: number;
}

/**
 * One step of franchise detection: resolve as many of the user's not-yet-
 * resolved titles as fit in the time budget, then regroup. The client calls
 * this repeatedly until `remaining` is 0, showing progress in between.
 */
export async function detectFranchisesStep(): Promise<DetectResult> {
  try {
    const user = await requireUser();
    const started = Date.now();

    const pending: { slug: CategorySlug; media: any }[] = [];
    for (const cat of CATEGORY_LIST) {
      const rows = await prisma.userMediaActivity.findMany({
        where: {
          userId: user.id,
          category: cat.dbCategory,
          [cat.prismaModel]: { is: { franchiseName: null } },
        } as any,
        select: {
          [cat.prismaModel]: {
            select: { id: true, externalId: true, title: true, franchiseName: true },
          },
        } as any,
      });
      for (const row of rows as any[]) pending.push({ slug: cat.slug, media: row[cat.prismaModel] });
    }

    let resolved = 0;
    let failed = 0;
    for (const item of pending) {
      if (Date.now() - started > STEP_BUDGET_MS) break;
      if (await resolveMediaRow(item.slug, item.media)) resolved++;
      else failed++;
      // Pace provider calls (AniList in particular rate-limits aggressively).
      await new Promise((r) => setTimeout(r, 800));
      // Several provider failures in a row: stop instead of hammering the API.
      if (failed >= 3) break;
    }

    const groups = await syncUserFranchises(user.id);
    revalidateAll();
    if (failed >= 3) {
      return {
        ok: resolved > 0,
        error: 'Some providers are not responding. Run detection again later.',
        resolved,
        remaining: 0,
        groups,
      };
    }
    return { ok: true, resolved, remaining: pending.length - resolved, groups };
  } catch (err) {
    return { ...fail(err, 'Detection failed.'), resolved: 0, remaining: 0, groups: 0 };
  }
}

async function ownFranchise(userId: string, id: string) {
  const f = await prisma.franchise.findUnique({ where: { id } });
  return f && f.userId === userId ? f : null;
}

/** Rename, rate (1–10 or null), annotate, or set the cover of a franchise. */
export async function updateFranchise(
  id: string,
  data: { name?: string; rating?: number | null; notes?: string; imageUrl?: string | null },
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!(await ownFranchise(user.id, id))) return { ok: false, error: 'Not found.' };

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) return { ok: false, error: 'Name cannot be empty.' };
      const matchName = normalizeTitle(name) || name.toLowerCase();
      const clash = await prisma.franchise.findUnique({
        where: { userId_matchName: { userId: user.id, matchName } },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        return { ok: false, error: 'Another franchise already has that name. Merge them instead.' };
      }
      patch.name = name;
      patch.matchName = matchName;
    }
    if (data.rating !== undefined) {
      if (data.rating === null) {
        patch.rating = null;
      } else {
        const rating = normalizeRating(data.rating);
        if (rating === null) return { ok: false, error: 'Score must be between 0 and 10.' };
        patch.rating = rating;
      }
    }
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.imageUrl !== undefined) patch.imageUrl = data.imageUrl;

    await prisma.franchise.update({ where: { id }, data: patch });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update franchise.');
  }
}

/**
 * Put a title into a franchise by hand: an existing franchise id, `null` to
 * take it out of any franchise, or `'new'` to start a new franchise named
 * after the title. Manual choices are locked against auto-detection.
 */
export async function assignFranchise(
  activityId: string,
  target: string | null,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const activity = await prisma.userMediaActivity.findUnique({
      where: { id: activityId },
      include: Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true])) as any,
    });
    if (!activity || activity.userId !== user.id) return { ok: false, error: 'Not found.' };

    let franchiseId: string | null = null;
    if (target === 'new') {
      const cat = CATEGORY_LIST.find((c) => c.dbCategory === activity.category);
      const media = cat ? (activity as any)[cat.prismaModel] : null;
      const name: string = media?.title ?? 'Untitled';
      const matchName = normalizeTitle(name) || name.toLowerCase();
      const f = await prisma.franchise.upsert({
        where: { userId_matchName: { userId: user.id, matchName } },
        update: {},
        create: { userId: user.id, name, matchName, imageUrl: media?.imageUrl ?? null },
      });
      franchiseId = f.id;
    } else if (target) {
      if (!(await ownFranchise(user.id, target))) return { ok: false, error: 'Franchise not found.' };
      franchiseId = target;
    }

    await prisma.userMediaActivity.update({
      where: { id: activityId },
      data: { franchiseId, franchiseLocked: true },
    });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update franchise.');
  }
}

/**
 * Put several of the user's titles into one of their franchises, locked so
 * regrouping keeps them there (used after "Add missing titles"). Up to 100
 * ids; ids that aren't the caller's are ignored.
 */
export async function addToFranchise(franchiseId: string, activityIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (typeof franchiseId !== 'string' || !(await ownFranchise(user.id, franchiseId))) {
      return { ok: false, error: 'Franchise not found.' };
    }
    if (!Array.isArray(activityIds) || activityIds.length > 100 || activityIds.some((id) => typeof id !== 'string')) {
      return { ok: false, error: 'Send at most 100 titles at a time.' };
    }
    await prisma.userMediaActivity.updateMany({
      where: { id: { in: activityIds }, userId: user.id },
      data: { franchiseId, franchiseLocked: true },
    });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update franchise.');
  }
}

/** Move every title of `sourceId` into `targetId`, then delete the source. */
export async function mergeFranchise(sourceId: string, targetId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (sourceId === targetId) return { ok: false, error: 'Pick a different franchise.' };
    const [src, dst] = await Promise.all([
      ownFranchise(user.id, sourceId),
      ownFranchise(user.id, targetId),
    ]);
    if (!src || !dst) return { ok: false, error: 'Not found.' };

    await prisma.$transaction([
      prisma.userMediaActivity.updateMany({
        where: { userId: user.id, franchiseId: sourceId },
        data: { franchiseId: targetId, franchiseLocked: true },
      }),
      prisma.franchise.delete({ where: { id: sourceId } }),
    ]);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to merge.');
  }
}

/**
 * Delete a franchise. Its titles stay in the library, ungrouped, and are
 * locked so auto-detection does not immediately recreate the group.
 */
export async function deleteFranchise(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!(await ownFranchise(user.id, id))) return { ok: false, error: 'Not found.' };
    await prisma.$transaction([
      prisma.userMediaActivity.updateMany({
        where: { userId: user.id, franchiseId: id },
        data: { franchiseId: null, franchiseLocked: true },
      }),
      prisma.franchise.delete({ where: { id } }),
    ]);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to delete.');
  }
}

/** Persist the full franchise ranking (best first); others become unranked. */
export async function saveFranchiseRanking(orderedIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const owned = await prisma.franchise.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((o) => o.id));
    const ids = [...new Set(orderedIds)].filter((id) => ownedIds.has(id));
    await prisma.$transaction([
      prisma.franchise.updateMany({
        where: { userId: user.id, id: { notIn: ids } },
        data: { rankOrder: null },
      }),
      ...ids.map((id, i) =>
        prisma.franchise.update({ where: { id }, data: { rankOrder: (i + 1) * 1000 } }),
      ),
    ]);
    revalidatePath('/franchises');
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save ranking.');
  }
}

/** Switch a franchise's watch order between release order and your own (4.7). */
export async function setFranchiseOrderMode(id: string, mode: unknown): Promise<ActionResult> {
  if (typeof id !== 'string' || !isOrderMode(mode)) return { ok: false, error: 'Unknown order.' };
  try {
    const user = await requireUser();
    if (!(await ownFranchise(user.id, id))) return { ok: false, error: 'Not found.' };
    await prisma.franchise.update({ where: { id }, data: { orderMode: mode } });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change the order.');
  }
}

/**
 * Save a franchise's manual watch order (first = watch first). Every id must
 * be one of the franchise's own titles; members left out keep no position
 * and follow in release order.
 */
export async function saveFranchiseOrder(id: string, orderedActivityIds: unknown): Promise<ActionResult> {
  if (
    typeof id !== 'string' ||
    !Array.isArray(orderedActivityIds) ||
    orderedActivityIds.length > 1000 ||
    !orderedActivityIds.every((x) => typeof x === 'string')
  ) {
    return { ok: false, error: 'Invalid order.' };
  }
  try {
    const user = await requireUser();
    if (!(await ownFranchise(user.id, id))) return { ok: false, error: 'Not found.' };
    const members = await prisma.userMediaActivity.findMany({
      where: { userId: user.id, franchiseId: id },
      select: { id: true },
    });
    const memberIds = new Set(members.map((m) => m.id));
    const ids = [...new Set(orderedActivityIds as string[])];
    if (!ids.every((x) => memberIds.has(x))) return { ok: false, error: 'Those titles are not all in this franchise.' };
    await prisma.$transaction([
      prisma.userMediaActivity.updateMany({
        where: { userId: user.id, franchiseId: id, id: { notIn: ids } },
        data: { franchiseOrder: null },
      }),
      ...ids.map((activityId, i) =>
        prisma.userMediaActivity.update({ where: { id: activityId }, data: { franchiseOrder: (i + 1) * 1000 } }),
      ),
      prisma.franchise.update({ where: { id }, data: { orderMode: 'manual' } }),
    ]);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save the order.');
  }
}

/** One provider's part of "Add missing titles". */
export interface MissingGroup {
  provider: 'AniList' | 'TMDB' | 'IGDB';
  titles: MissingTitle[];
  /** Why this part is empty or incomplete (not configured, provider down). */
  message?: string;
}

const GRAPH_BY_MAL = `query ($ids: [Int], $type: MediaType) {
  Page(perPage: 50) { media(idMal_in: $ids, type: $type) { ${GRAPH_FIELDS} } } }`;
const GRAPH_BY_IDS = `query ($ids: [Int]) {
  Page(perPage: 50) { media(id_in: $ids) { ${GRAPH_FIELDS} } } }`;

/**
 * The titles of a franchise's IP that the user doesn't have yet (spec 2.10),
 * per provider: AniList relations for anime and manga, the TMDB collection
 * for films, the IGDB franchise or collection for games. Only the caller's
 * own franchise; a missing key or a provider failure only empties that
 * provider's part, with a message (spec G4).
 */
export async function franchiseMissing(
  franchiseId: string,
): Promise<ActionResult & { groups?: MissingGroup[] }> {
  try {
    const user = await requireUser();
    if (typeof franchiseId !== 'string' || !(await ownFranchise(user.id, franchiseId))) {
      return { ok: false, error: 'Not found.' };
    }
    const limited = takeActionRate('franchiseMissing', user.id);
    if (limited) return { ok: false, error: limited };

    // The members' catalogue rows: their ids and provider franchise keys.
    const members: Array<{ slug: CategorySlug; externalId: string; franchiseKey: string | null }> = [];
    for (const cat of CATEGORY_LIST) {
      const rows = await prisma.userMediaActivity.findMany({
        where: { userId: user.id, franchiseId, category: cat.dbCategory },
        select: { [cat.prismaModel]: { select: { externalId: true, franchiseKey: true } } } as any,
      });
      for (const r of rows as any[]) {
        const m = r[cat.prismaModel];
        if (m) members.push({ slug: cat.slug, externalId: m.externalId, franchiseKey: m.franchiseKey ?? null });
      }
    }

    const groups: MissingGroup[] = [];
    const failed = (provider: string, err: unknown) => console.error('[franchise missing] %s failed:', provider, err);

    const start = aniListStart(members);
    if (start.al.length || start.mal.ANIME.length || start.mal.MANGA.length) {
      try {
        const nodes = await walkAniList(start, {
          byMal: (type, ids) => anilistQuery<AniListGraphNode>(GRAPH_BY_MAL, { ids, type }, 'AniList franchise'),
          byIds: (ids) => anilistQuery<AniListGraphNode>(GRAPH_BY_IDS, { ids }, 'AniList franchise'),
          pause: (ms) => new Promise((r) => setTimeout(r, ms)),
        });
        groups.push({ provider: 'AniList', titles: nodesToTitles(nodes) });
      } catch (err) {
        groups.push({ provider: 'AniList', titles: [], message: 'AniList could not be reached. Try again later.' });
        failed('AniList', err);
      }
    }

    const keys = providerKeys(members.map((m) => m.franchiseKey));
    if (keys.tmdbCollections.length) {
      if (!tmdbConfigured()) {
        groups.push({ provider: 'TMDB', titles: [], message: "TMDB isn't configured on this server, so the films can't be looked up." });
      } else {
        try {
          const titles: MissingTitle[] = [];
          for (const id of keys.tmdbCollections.slice(0, 5)) {
            for (const result of await fetchCollectionParts(id)) titles.push({ slug: 'movies', result });
          }
          groups.push({ provider: 'TMDB', titles });
        } catch (err) {
          groups.push({ provider: 'TMDB', titles: [], message: 'TMDB could not be reached. Try again later.' });
          failed('TMDB', err);
        }
      }
    }
    if (keys.igdb.length) {
      if (!igdbConfigured()) {
        groups.push({ provider: 'IGDB', titles: [], message: "IGDB isn't configured on this server, so the games can't be looked up." });
      } else {
        try {
          const titles: MissingTitle[] = [];
          for (const key of keys.igdb.slice(0, 5)) {
            for (const result of await fetchFranchiseGames(key)) titles.push({ slug: 'games', result });
          }
          groups.push({ provider: 'IGDB', titles });
        } catch (err) {
          groups.push({ provider: 'IGDB', titles: [], message: 'IGDB could not be reached. Try again later.' });
          failed('IGDB', err);
        }
      }
    }

    // Leave out everything already in the user's library (any franchise).
    const owned = new Set<string>();
    const wanted = new Map<CategorySlug, Set<string>>();
    for (const g of groups) for (const t of g.titles) {
      if (!wanted.has(t.slug)) wanted.set(t.slug, new Set());
      wanted.get(t.slug)!.add(t.result.externalId);
    }
    for (const [slug, ids] of wanted) {
      const cat = CATEGORY_LIST.find((c) => c.slug === slug)!;
      const rows = await prisma.userMediaActivity.findMany({
        where: { userId: user.id, category: cat.dbCategory, [cat.prismaModel]: { is: { externalId: { in: [...ids] } } } } as any,
        select: { [cat.prismaModel]: { select: { externalId: true } } } as any,
      });
      for (const r of rows as any[]) owned.add(`${slug}|${r[cat.prismaModel].externalId}`);
    }
    return { ok: true, groups: groups.map((g) => ({ ...g, titles: missingTitles(g.titles, owned) })) };
  } catch (err) {
    return fail(err, 'Could not look up the missing titles.');
  }
}
