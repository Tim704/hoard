'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Share link server actions (spec 4.1): create (or reuse) a public read-only
//  link to one thing of yours, and revoke it. Only the owner can do either.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { shareableKind } from '@/lib/data-share';
import { absoluteUrl } from '@/lib/public-url';
import {
  canManageShare,
  isShareKind,
  isValidShareTarget,
  newShareToken,
  reusableShare,
  sharePath,
} from '@/lib/share';
import type { ActionResult } from '@/lib/types';

/**
 * The public link for `kind` + `target` ("tiers" + "books"): the active one
 * if there is one, otherwise a new one.
 */
export async function createShareLink(
  kind: unknown,
  target: unknown,
): Promise<ActionResult & { url?: string; reused?: boolean }> {
  if (!isShareKind(kind) || !shareableKind(kind) || !isValidShareTarget(kind, target)) {
    return { ok: false, error: 'That cannot be shared.' };
  }
  try {
    const user = await requireUser();
    const existing = reusableShare(
      await prisma.shareLink.findMany({ where: { userId: user.id, kind, target, revokedAt: null } }),
      user.id,
      kind,
      target,
    );
    const link =
      existing ??
      (await prisma.shareLink.create({ data: { id: newShareToken(), userId: user.id, kind, target } }));
    revalidatePath('/settings');
    return { ok: true, url: absoluteUrl(sharePath(link.id)), reused: existing !== null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create the link.' };
  }
}

/** Revoke one of your links: it answers 404 from now on. */
export async function revokeShareLink(id: unknown): Promise<ActionResult> {
  if (typeof id !== 'string' || id.length > 128) return { ok: false, error: 'Unknown link.' };
  try {
    const user = await requireUser();
    const link = await prisma.shareLink.findUnique({ where: { id } });
    if (!canManageShare(link, user.id)) return { ok: false, error: 'Unknown link.' };
    await prisma.shareLink.updateMany({
      where: { id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not revoke the link.' };
  }
}
