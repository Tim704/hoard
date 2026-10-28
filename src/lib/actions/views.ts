'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Saved views (spec 8.6): create, change, rename and delete. Each action
//  authenticates and only touches the caller's own views (as media.ts does).
//  Queries are validated by src/lib/saved-views.ts (unknown keys dropped,
//  arrays bounded) and names cleaned to 60 characters.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { cleanViewName, MAX_VIEWS, parseViewQuery } from '@/lib/saved-views';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

const fail = (err: unknown, fallback: string): ActionResult => ({
  ok: false,
  error: err instanceof Error && err.message ? err.message : fallback,
});

// The views live in the navigation of every page.
const refresh = () => revalidatePath('/', 'layout');

async function ownView(userId: string, id: unknown) {
  if (typeof id !== 'string' || !id) return null;
  const v = await prisma.savedView.findUnique({ where: { id }, select: { id: true, userId: true } });
  return v && v.userId === userId ? v : null;
}

export async function createView(name: unknown, query: unknown): Promise<ActionResult & { id?: string }> {
  try {
    const user = await requireUser();
    const clean = cleanViewName(name);
    if (!clean) return { ok: false, error: 'Give the view a name.' };
    const data = parseViewQuery(query);
    // Count and create under the user's row lock, so two saves can't pass the cap.
    const view = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if ((await tx.savedView.count({ where: { userId: user.id } })) >= MAX_VIEWS) return null;
      return tx.savedView.create({ data: { userId: user.id, name: clean, query: data }, select: { id: true } });
    });
    if (!view) return { ok: false, error: `You can keep up to ${MAX_VIEWS} views. Delete one first.` };
    refresh();
    return { ok: true, id: view.id };
  } catch (err) {
    return fail(err, 'Could not save the view.');
  }
}

export async function updateViewQuery(id: unknown, query: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const view = await ownView(user.id, id);
    if (!view) return { ok: false, error: 'Not found.' };
    await prisma.savedView.update({ where: { id: view.id }, data: { query: parseViewQuery(query) } });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save the view.');
  }
}

export async function renameView(id: unknown, name: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const view = await ownView(user.id, id);
    if (!view) return { ok: false, error: 'Not found.' };
    const clean = cleanViewName(name);
    if (!clean) return { ok: false, error: 'Give the view a name.' };
    await prisma.savedView.update({ where: { id: view.id }, data: { name: clean } });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not rename the view.');
  }
}

export async function deleteView(id: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const view = await ownView(user.id, id);
    if (!view) return { ok: false, error: 'Not found.' };
    await prisma.savedView.delete({ where: { id: view.id } });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not delete the view.');
  }
}
