'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Reference list actions (spec 4.8). A list belongs to its creator only.
//  Built-ins fill one provider page per call (`refreshRefListStep`), so the
//  client drives the loop and shows progress; pasted titles are matched ten
//  at a time through the import matcher (`addPastedRefItems`). Provider
//  failures and missing keys come back as friendly errors (G4).
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { isCategorySlug } from '@/lib/categories';
import { includedByDefault } from '@/lib/import/match';
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

const fail = (err: unknown, fallback: string): ActionResult => ({
  ok: false,
  error: err instanceof Error ? err.message : fallback,
});

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

/** Append items after the list's last position (skipping titles already on it). */
async function appendItems(listId: string, category: string, batch: RefItem[], room: number, replace = false) {
  const existing = replace
    ? []
    : await prisma.refListItem.findMany({ where: { listId }, select: { externalId: true, position: true } });
  const fresh = newRefItems(new Set(existing.map((e) => e.externalId)), batch, room - existing.length);
  const start = existing.reduce((m, e) => Math.max(m, e.position), 0);
  await prisma.$transaction([
    ...(replace ? [prisma.refListItem.deleteMany({ where: { listId } })] : []),
    prisma.refListItem.createMany({
      data: fresh.map((it, i) => ({
        listId,
        category,
        externalId: it.externalId,
        title: it.title.slice(0, PASTE_MAX_TITLE),
        year: it.year,
        imageUrl: it.imageUrl,
        position: start + i + 1,
      })),
    }),
  ]);
  return { added: fresh.length, total: existing.length + fresh.length };
}

/**
 * Start a built-in list (or hand back the one you already have). It is
 * filled by `refreshRefListStep` right after.
 */
export async function createBuiltinRefList(source: unknown): Promise<ActionResult & { id?: string; existing?: boolean }> {
  if (!isBuiltinSource(source)) return { ok: false, error: 'Unknown list.' };
  try {
    const user = await requireUser();
    const mine = await prisma.refList.findFirst({ where: { userId: user.id, source }, select: { id: true } });
    if (mine) return { ok: true, id: mine.id, existing: true };
    if (!refSourceConfigured(source)) {
      const p = BUILTIN_REF_LISTS[source].provider;
      return { ok: false, error: `${p} isn't configured on this server, so this list isn't available. Ask the owner to add its API key.` };
    }
    const b = BUILTIN_REF_LISTS[source];
    const list = await prisma.refList.create({
      data: { userId: user.id, name: b.name, source, category: b.category },
    });
    revalidate();
    return { ok: true, id: list.id, existing: false };
  } catch (err) {
    return fail(err, 'Could not create the list.');
  }
}

/**
 * Fetch page `page` (0-based) of a built-in list. Page 0 replaces the stored
 * items (only once it has arrived, so a failed refresh keeps the old list);
 * later pages append. `done` once every page is in.
 */
export async function refreshRefListStep(
  listId: unknown,
  page: unknown,
): Promise<ActionResult & { done?: boolean; pages?: number; total?: number }> {
  try {
    const user = await requireUser();
    const list = await ownList(user.id, listId);
    if (!list) return NOT_FOUND;
    if (!isBuiltinSource(list.source)) return { ok: false, error: 'Only built-in lists can be refreshed.' };
    const pages = refPageCount(list.source);
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page >= pages) {
      return { ok: false, error: 'Invalid page.' };
    }
    if (!refSourceConfigured(list.source)) {
      return { ok: false, error: `${BUILTIN_REF_LISTS[list.source].provider} isn't configured on this server.` };
    }
    let batch: RefItem[];
    try {
      batch = await fetchRefPage(list.source, page);
    } catch {
      return { ok: false, error: `${BUILTIN_REF_LISTS[list.source].provider} is not responding. Try again later.` };
    }
    const { total } = await appendItems(list.id, list.category, batch, BUILTIN_REF_LISTS[list.source].size, page === 0);
    const done = page + 1 >= pages || batch.length === 0;
    if (done) await prisma.refList.update({ where: { id: list.id }, data: { refreshedAt: new Date() } });
    revalidate(list.id);
    return { ok: true, done, pages, total };
  } catch (err) {
    return fail(err, 'Could not fetch the list.');
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
 * matcher: provider search by title and year) and store the high and
 * medium confidence matches. Unmatched titles come back so the page can name them.
 */
export async function addPastedRefItems(
  listId: unknown,
  titles: unknown,
): Promise<ActionResult & { added?: number; missed?: string[] }> {
  const parsed = PastedSchema.safeParse(titles);
  if (!parsed.success) return { ok: false, error: `Send 1 to ${MATCH_CHUNK} titles at a time.` };
  try {
    const user = await requireUser();
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
      // Only matches the import review would tick by default (high / medium).
      const hit = m.chosenIndex >= 0 && includedByDefault(m.confidence) ? m.candidates[m.chosenIndex] : null;
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
