'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Reference list actions (spec 4.8). A list belongs to its creator only.
//  A built-in is (re)fetched whole by `refreshRefList`: every provider page
//  one after another inside a time budget, then the stored items are
//  replaced in one transaction, so a failed refresh keeps the old list.
//  Pasted titles are matched ten at a time through the import matcher
//  (`addPastedRefItems`). Provider failures and missing keys come back as
//  friendly errors (G4).
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { isCategorySlug } from '@/lib/categories';
import { matchRows } from '@/lib/import/matcher';
import { serverMatchDeps } from '@/lib/import/server';
import { MATCH_CHUNK, type ImportRow } from '@/lib/import/types';
import { parseListInput } from '@/lib/lists';
import { isManualId } from '@/lib/manual';
import { fetchRefPage, refSourceConfigured, toRefItem } from '@/lib/reflists-server';
import {
  BUILTIN_REF_LISTS,
  CUSTOM_SOURCE,
  isBuiltinSource,
  newRefItems,
  PASTE_MAX_LINES,
  PASTE_MAX_TITLE,
  refPageCount,
  type RefItem,
} from '@/lib/reflists';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';
import { takeActionRate } from '@/lib/rate-limit';

/** A friendly failure; the real error goes to the server log, never to the client. */
function fail(err: unknown, fallback: string): ActionResult {
  console.error('[%s] %s', fallback, err instanceof Error ? err.message : err);
  return { ok: false, error: fallback };
}

const NOT_FOUND: ActionResult = { ok: false, error: 'List not found.' };

async function ownList(userId: string, id: unknown) {
  if (typeof id !== 'string' || id.length > 64) return null;
  const list = await prisma.refList.findUnique({ where: { id } });
  return list && list.userId === userId ? list : null;
}

function revalidate(id?: string) {
  revalidatePath('/lists');
  if (id) revalidatePath(`/lists/ref/${id}`);
}

/** createMany rows for `items`, positions from `start + 1`. */
const itemRows = (listId: string, category: string, items: RefItem[], start: number) =>
  items.map((it, i) => ({
    listId,
    category,
    externalId: it.externalId,
    title: it.title.slice(0, PASTE_MAX_TITLE),
    year: it.year,
    imageUrl: it.imageUrl,
    position: start + i + 1,
  }));

/**
 * Append items after the list's last position. Titles already on it are
 * skipped (and the unique (listId, externalId) catches a concurrent append).
 */
async function appendItems(listId: string, category: string, batch: RefItem[], room: number) {
  const existing = await prisma.refListItem.findMany({ where: { listId }, select: { externalId: true, position: true } });
  const fresh = newRefItems(new Set(existing.map((e) => e.externalId)), batch, room - existing.length);
  const start = existing.reduce((m, e) => Math.max(m, e.position), 0);
  await prisma.refListItem.createMany({ data: itemRows(listId, category, fresh, start), skipDuplicates: true });
  return { added: fresh.length, total: existing.length + fresh.length };
}

/** Wall-clock budget for fetching every page of a built-in (under the tunnel's 100 s). */
const REFRESH_BUDGET_MS = 60_000;
/** Pause between two provider pages (AniList rate-limits; be gentle with all). */
const PAGE_GAP_MS = 400;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));


/**
 * Start a built-in list (or hand back the one you already have). It is
 * filled by `refreshRefListStep` right after.
 */
export async function createBuiltinRefList(source: unknown): Promise<ActionResult & { id?: string; existing?: boolean }> {
  if (!isBuiltinSource(source)) return { ok: false, error: 'Unknown list.' };
  try {
    const user = await requireUser();
    const limited = takeActionRate('refList', user.id);
    if (limited) return { ok: false, error: limited };
    const configured = refSourceConfigured(source);
    const b = BUILTIN_REF_LISTS[source];
    // One built-in list per user and source, even on a double click: a
    // transaction-scoped advisory lock serialises the check and the create.
    const out = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reflist:${user.id}:${source}`}))`;
      const mine = await tx.refList.findFirst({ where: { userId: user.id, source }, select: { id: true } });
      if (mine) return { id: mine.id, existing: true };
      if (!configured) return null;
      const list = await tx.refList.create({ data: { userId: user.id, name: b.name, source, category: b.category } });
      return { id: list.id, existing: false };
    });
    if (!out) {
      return { ok: false, error: `${b.provider} isn't configured on this server, so this list isn't available. Ask the owner to add its API key.` };
    }
    revalidate();
    return { ok: true, ...out };
  } catch (err) {
    return fail(err, 'Could not create the list.');
  }
}

/**
 * (Re)fetch a built-in list: every provider page in turn (paced, inside a
 * time budget), then replace the stored items in ONE transaction. Any page
 * failing, or the budget running out, leaves the old items untouched.
 */
export async function refreshRefList(listId: unknown): Promise<ActionResult & { total?: number }> {
  try {
    const user = await requireUser();
    const list = await ownList(user.id, listId);
    if (!list) return NOT_FOUND;
    if (!isBuiltinSource(list.source)) return { ok: false, error: 'Only built-in lists can be refreshed.' };
    const limited = takeActionRate('refList', user.id);
    if (limited) return { ok: false, error: limited };
    const source = list.source;
    const { provider, size } = BUILTIN_REF_LISTS[source];
    if (!refSourceConfigured(source)) return { ok: false, error: `${provider} isn't configured on this server.` };

    const started = Date.now();
    const fetched: RefItem[] = [];
    for (let page = 0; page < refPageCount(source); page++) {
      if (Date.now() - started > REFRESH_BUDGET_MS) {
        return { ok: false, error: `${provider} is too slow right now. Your list was kept as it was; try again later.` };
      }
      if (page > 0) await sleep(PAGE_GAP_MS);
      let batch: RefItem[];
      try {
        batch = await fetchRefPage(source, page);
      } catch {
        return { ok: false, error: `${provider} is not responding. Your list was kept as it was; try again later.` };
      }
      fetched.push(...batch);
      if (batch.length === 0 || fetched.length >= size) break;
    }
    const items = newRefItems(new Set(), fetched, size);
    if (items.length === 0) {
      return { ok: false, error: `${provider} sent an empty list. Your list was kept as it was.` };
    }
    await prisma.$transaction([
      prisma.refListItem.deleteMany({ where: { listId: list.id } }),
      prisma.refListItem.createMany({ data: itemRows(list.id, list.category, items, 0), skipDuplicates: true }),
      prisma.refList.update({ where: { id: list.id }, data: { refreshedAt: new Date() } }),
    ]);
    revalidate(list.id);
    return { ok: true, total: items.length };
  } catch {
    return { ok: false, error: 'Could not fetch the list. Your list was kept as it was.' };
  }
}

/** A list of your own titles, filled by `addPastedRefItems`. */
export async function createPastedRefList(name: unknown, category: unknown): Promise<ActionResult & { id?: string }> {
  const input = parseListInput(name, null);
  if (!input.ok) return { ok: false, error: input.error };
  if (typeof category !== 'string' || !isCategorySlug(category)) return { ok: false, error: 'Pick a section.' };
  try {
    const user = await requireUser();
    const list = await prisma.refList.create({
      data: { userId: user.id, name: input.name, source: CUSTOM_SOURCE, category },
    });
    revalidate();
    return { ok: true, id: list.id };
  } catch (err) {
    return fail(err, 'Could not create the list.');
  }
}

const PastedSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(PASTE_MAX_TITLE),
      year: z.number().int().min(1800).max(2100).optional(),
    }),
  )
  .min(1)
  .max(MATCH_CHUNK);

/**
 * Match up to MATCH_CHUNK pasted titles in the list's section (the import
 * matcher: provider search by title and year) and store the high-confidence
 * matches only. Unmatched titles come back so the page can name them.
 */
export async function addPastedRefItems(
  listId: unknown,
  titles: unknown,
): Promise<ActionResult & { added?: number; missed?: string[] }> {
  const parsed = PastedSchema.safeParse(titles);
  if (!parsed.success) return { ok: false, error: `Send 1 to ${MATCH_CHUNK} titles at a time.` };
  try {
    const user = await requireUser();
    const limited = takeActionRate('addPastedRefItems', user.id);
    if (limited) return { ok: false, error: limited };
    const list = await ownList(user.id, listId);
    if (!list) return NOT_FOUND;
    if (list.source !== CUSTOM_SOURCE || !isCategorySlug(list.category)) {
      return { ok: false, error: 'Titles can only be pasted into your own lists.' };
    }
    const category = list.category;
    const rows: ImportRow[] = parsed.data.map((t) => ({
      source: 'ai',
      category,
      title: t.title,
      ...(t.year ? { year: t.year } : {}),
      ids: {},
      status: 'PLANNED',
    }));
    const matches = await matchRows(rows, serverMatchDeps(user.id));
    const found: RefItem[] = [];
    const missed: string[] = [];
    matches.forEach((m, i) => {
      // Only sure matches (same title AND year, or an id) go in by themselves;
      // the rest are named back so they can be added by search.
      const hit = m.chosenIndex >= 0 && m.confidence === 'high' ? m.candidates[m.chosenIndex] : null;
      if (hit && !isManualId(hit.externalId)) found.push(toRefItem(hit));
      else missed.push(rows[i].title);
    });
    if (missed.length === rows.length && matches.some((m) => m.message)) {
      const message = matches.find((m) => m.message)?.message;
      if (message) return { ok: false, error: message };
    }
    const { added } = await appendItems(list.id, category, found, PASTE_MAX_LINES);
    revalidate(list.id);
    return { ok: true, added, missed };
  } catch (err) {
    return fail(err, 'Could not match those titles.');
  }
}

/** Take one title off one of your pasted lists (built-ins come back on refresh). */
export async function removeRefListItem(listId: unknown, itemId: unknown): Promise<ActionResult> {
  if (typeof itemId !== 'string' || itemId.length > 64) return { ok: false, error: 'Not found.' };
  try {
    const user = await requireUser();
    const list = await ownList(user.id, listId);
    if (!list) return NOT_FOUND;
    if (list.source !== CUSTOM_SOURCE) return { ok: false, error: 'Titles can only be removed from your own pasted lists.' };
    await prisma.refListItem.deleteMany({ where: { id: itemId, listId: list.id } });
    revalidate(list.id);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not remove that title.' };
  }
}

export async function renameRefList(listId: unknown, name: unknown): Promise<ActionResult> {
  const input = parseListInput(name, null);
  if (!input.ok) return { ok: false, error: input.error };
  try {
    const user = await requireUser();
    const list = await ownList(user.id, listId);
    if (!list) return NOT_FOUND;
    await prisma.refList.update({ where: { id: list.id }, data: { name: input.name } });
    revalidate(list.id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not rename the list.');
  }
}

export async function deleteRefList(listId: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const list = await ownList(user.id, listId);
    if (!list) return NOT_FOUND;
    await prisma.refList.delete({ where: { id: list.id } });
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not delete the list.');
  }
}
