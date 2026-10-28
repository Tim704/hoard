'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Custom list actions (spec 4.11). Every action loads the list with its
//  members and checks the caller's role (src/lib/lists.ts) before writing:
//  owner for list settings and members, owner or editor for items. Items
//  point at catalogue rows; adding one never touches anyone's library, and
//  removing a title from your library never touches lists.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, getCategory, isCategorySlug } from '@/lib/categories';
import { enrichResult } from '@/lib/apis';
import { getEditableLists } from '@/lib/data-lists';
import { upsertCatalogueRow } from '@/lib/library/add';
import {
  canEditList,
  canManageList,
  isPermutation,
  LIST_ITEMS_MAX,
  LIST_MEMBERS_MAX,
  nextListPosition,
  parseListInput,
} from '@/lib/lists';
import { isManualId } from '@/lib/manual';
import { notify } from '@/lib/notify';
import { requireUser } from '@/lib/session';
import type { ActionResult, NormalizedResult } from '@/lib/types';

const fail = (err: unknown, fallback: string): ActionResult => ({
  ok: false,
  error: err instanceof Error ? err.message : fallback,
});

const NOT_FOUND: ActionResult = { ok: false, error: 'List not found.' };

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

async function loadList(id: unknown) {
  if (!isId(id)) return null;
  return prisma.customList.findUnique({
    where: { id },
    include: { members: { select: { userId: true, canEdit: true } } },
  });
}

function revalidateList(id: string) {
  revalidatePath('/lists');
  revalidatePath(`/lists/${id}`);
}

/** Bump the list's updatedAt so it sorts first. */
const touch = (id: string) => prisma.customList.update({ where: { id }, data: { updatedAt: new Date() } });

export async function createList(name: unknown, description: unknown): Promise<ActionResult & { id?: string }> {
  const input = parseListInput(name, description);
  if (!input.ok) return { ok: false, error: input.error };
  try {
    const user = await requireUser();
    const list = await prisma.customList.create({
      data: { ownerId: user.id, name: input.name, description: input.description },
    });
    revalidatePath('/lists');
    return { ok: true, id: list.id };
  } catch (err) {
    return fail(err, 'Could not create the list.');
  }
}

export async function updateList(id: unknown, name: unknown, description: unknown): Promise<ActionResult> {
  const input = parseListInput(name, description);
  if (!input.ok) return { ok: false, error: input.error };
  try {
    const user = await requireUser();
    const list = await loadList(id);
    if (!canManageList(list, user.id)) return NOT_FOUND;
    await prisma.customList.update({ where: { id: list!.id }, data: { name: input.name, description: input.description } });
    revalidateList(list!.id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save the list.');
  }
}

/** Delete a list (owner only). Its public links stop working with it. */
export async function deleteList(id: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const list = await loadList(id);
    if (!canManageList(list, user.id)) return NOT_FOUND;
    await prisma.$transaction([
      prisma.shareLink.updateMany({
        where: { userId: user.id, kind: 'list', target: list!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.customList.delete({ where: { id: list!.id } }),
    ]);
    revalidatePath('/lists');
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not delete the list.');
  }
}

/** Put a catalogue row on a list (no-op when it is already there). */
async function addItem(listId: string, category: string, mediaId: string, userId: string): Promise<ActionResult & { existing?: boolean }> {
  const existing = await prisma.customListItem.findUnique({
    where: { listId_category_mediaId: { listId, category, mediaId } },
    select: { id: true },
  });
  if (existing) return { ok: true, existing: true };
  const agg = await prisma.customListItem.aggregate({ where: { listId }, _max: { position: true }, _count: true });
  if (agg._count >= LIST_ITEMS_MAX) return { ok: false, error: `A list holds at most ${LIST_ITEMS_MAX} titles.` };
  try {
    await prisma.customListItem.create({
      data: { listId, category, mediaId, addedById: userId, position: nextListPosition(agg._max.position) },
    });
  } catch (err) {
    // A concurrent add of the same title: it is on the list either way.
    if ((err as { code?: string })?.code === 'P2002') return { ok: true, existing: true };
    throw err;
  }
  await touch(listId);
  revalidateList(listId);
  return { ok: true, existing: false };
}

/** "Add to list…" from a title's details: one of YOUR titles onto a list you can edit. */
export async function addActivityToList(
  listId: unknown,
  activityId: unknown,
): Promise<ActionResult & { existing?: boolean }> {
  if (!isId(activityId)) return { ok: false, error: 'Not found.' };
  try {
    const user = await requireUser();
    const list = await loadList(listId);
    if (!canEditList(list, user.id)) return NOT_FOUND;
    const activity = await prisma.userMediaActivity.findUnique({ where: { id: activityId } });
    if (!activity || activity.userId !== user.id) return { ok: false, error: 'Not found.' };
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === activity.category);
    const mediaId = cat ? activity[cat.fkField] : null;
    if (!cat || !mediaId) return { ok: false, error: 'Not found.' };
    return await addItem(list!.id, cat.slug, mediaId, user.id);
  } catch (err) {
    return fail(err, 'Could not add it to the list.');
  }
}

const ResultSchema = z.object({
  externalId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  imageUrl: z.string().max(2000).nullable(),
  subtitle: z.string().max(1000).nullable(),
  year: z.number().int().nullable(),
  description: z.string().max(50_000).nullable(),
  fields: z.record(z.unknown()),
});

/**
 * Add a search hit to a list: the catalogue row is created (or only has its
 * empty columns filled, like any add), and NO library entry is made.
 */
export async function addResultToList(
  listId: unknown,
  slug: unknown,
  result: unknown,
): Promise<ActionResult & { existing?: boolean }> {
  const parsed = ResultSchema.safeParse(result);
  if (typeof slug !== 'string' || !isCategorySlug(slug) || !parsed.success) {
    return { ok: false, error: 'Could not add that title.' };
  }
  // Hand-made rows are private to whoever made them: never reachable by id.
  if (isManualId(parsed.data.externalId)) return { ok: false, error: 'Could not add that title.' };
  try {
    const user = await requireUser();
    const list = await loadList(listId);
    if (!canEditList(list, user.id)) return NOT_FOUND;
    const cat = getCategory(slug)!;
    const known = await (prisma as any)[cat.prismaModel].findUnique({
      where: { externalId: parsed.data.externalId },
      select: { id: true },
    });
    let mediaId: string | undefined = known?.id;
    if (!mediaId) {
      const enriched = await enrichResult(slug, parsed.data as NormalizedResult);
      const media = await prisma.$transaction((tx) =>
        upsertCatalogueRow(tx, slug, enriched.result, enriched.metaFetchedAt),
      );
      mediaId = media.id as string;
    }
    return await addItem(list!.id, slug, mediaId!, user.id);
  } catch (err) {
    return fail(err, 'Could not add it to the list.');
  }
}

export async function removeListItem(listId: unknown, itemId: unknown): Promise<ActionResult> {
  if (!isId(itemId)) return { ok: false, error: 'Not found.' };
  try {
    const user = await requireUser();
    const list = await loadList(listId);
    if (!canEditList(list, user.id)) return NOT_FOUND;
    await prisma.customListItem.deleteMany({ where: { id: itemId, listId: list!.id } });
    await touch(list!.id);
    revalidateList(list!.id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not remove that title.');
  }
}

/** Save a new order: `orderedItemIds` must be exactly the list's items. */
export async function reorderListItems(listId: unknown, orderedItemIds: unknown): Promise<ActionResult> {
  if (!Array.isArray(orderedItemIds) || orderedItemIds.length > LIST_ITEMS_MAX) {
    return { ok: false, error: 'Invalid order.' };
  }
  try {
    const user = await requireUser();
    const list = await loadList(listId);
    if (!canEditList(list, user.id)) return NOT_FOUND;
    const items = await prisma.customListItem.findMany({ where: { listId: list!.id }, select: { id: true } });
    if (!isPermutation(orderedItemIds, items.map((i) => i.id))) {
      return { ok: false, error: 'The list changed meanwhile. Reload and try again.' };
    }
    await prisma.$transaction([
      ...orderedItemIds.map((id, i) =>
        prisma.customListItem.update({ where: { id }, data: { position: (i + 1) * 1000 } }),
      ),
      touch(list!.id),
    ]);
    revalidateList(list!.id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save the order.');
  }
}

/**
 * Invite another user of this instance by exact username (owner only), as
 * a viewer or an editor. They get a notification ("list-shared").
 */
export async function inviteToList(listId: unknown, username: unknown, canEdit: unknown): Promise<ActionResult> {
  if (typeof username !== 'string' || !username.trim() || username.length > 64) {
    return { ok: false, error: 'Enter a username.' };
  }
  try {
    const user = await requireUser();
    const list = await loadList(listId);
    if (!canManageList(list, user.id)) return NOT_FOUND;
    const invitee = await prisma.user.findUnique({ where: { username: username.trim() }, select: { id: true } });
    // The same answer for unknown users and yourself: usernames don't leak.
    if (!invitee || invitee.id === user.id) return { ok: false, error: 'No other user has that username.' };
    const editor = canEdit === true;
    const already = list!.members.find((m) => m.userId === invitee.id);
    if (!already && list!.members.length >= LIST_MEMBERS_MAX) {
      return { ok: false, error: `A list can have at most ${LIST_MEMBERS_MAX} members.` };
    }
    await prisma.customListMember.upsert({
      where: { listId_userId: { listId: list!.id, userId: invitee.id } },
      update: { canEdit: editor },
      create: { listId: list!.id, userId: invitee.id, canEdit: editor },
    });
    if (!already) {
      await notify(invitee.id, {
        kind: 'list-shared',
        title: `${user.username} shared a list with you`,
        body: `“${list!.name}”: you can ${editor ? 'add and reorder titles' : 'view it'}.`,
        url: `/lists/${list!.id}`,
      });
    }
    revalidateList(list!.id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not invite them.');
  }
}

/** Make a member an editor or a viewer (owner only). */
export async function setListMemberRole(listId: unknown, memberId: unknown, canEdit: unknown): Promise<ActionResult> {
  if (!isId(memberId) || typeof canEdit !== 'boolean') return { ok: false, error: 'Not found.' };
  try {
    const user = await requireUser();
    const list = await loadList(listId);
    if (!canManageList(list, user.id)) return NOT_FOUND;
    await prisma.customListMember.updateMany({ where: { listId: list!.id, userId: memberId }, data: { canEdit } });
    revalidateList(list!.id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change their role.');
  }
}

/** Remove a member (owner), or leave a list (any member, `memberId` = yourself). */
export async function removeListMember(listId: unknown, memberId: unknown): Promise<ActionResult> {
  if (!isId(memberId)) return { ok: false, error: 'Not found.' };
  try {
    const user = await requireUser();
    const list = await loadList(listId);
    const self = memberId === user.id && list?.members.some((m) => m.userId === user.id);
    if (!list || (!self && !canManageList(list, user.id))) return NOT_FOUND;
    await prisma.customListMember.deleteMany({ where: { listId: list.id, userId: memberId } });
    revalidateList(list.id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not remove them.');
  }
}

/** Lists the caller may add to (for "Add to list…"). */
export async function listEditableLists(): Promise<{ id: string; name: string }[]> {
  const user = await requireUser();
  return getEditableLists(user.id);
}
