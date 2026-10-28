'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → API tokens (spec 8.7): create (the token is returned once and
//  only its hash is stored), revoke. Each action authenticates and only
//  touches the caller's own tokens (as media.ts does). At most 10 per user.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { cleanTokenName, generateToken, hashToken, MAX_TOKENS } from '@/lib/api-tokens';
import { takeRate } from '@/lib/rate-limit';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

/** Creating tokens is rare; a small budget keeps a runaway script tame. */
const CREATE_LIMITS = { perMinute: 5, perDay: 30 };

export async function createApiToken(name: unknown): Promise<ActionResult & { token?: string }> {
  try {
    const user = await requireUser();
    const clean = cleanTokenName(name);
    if (!clean) return { ok: false, error: 'Give the token a name.' };
    const rate = takeRate(`api-token:${user.id}`, CREATE_LIMITS);
    if (!rate.ok) return { ok: false, error: `Too many new tokens. Try again in ${rate.retryAfterSec} s.` };
    const token = generateToken();
    // Count and create under the user's row lock, so two clicks can't pass 10.
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if ((await tx.apiToken.count({ where: { userId: user.id } })) >= MAX_TOKENS) return false;
      await tx.apiToken.create({ data: { userId: user.id, name: clean, tokenHash: hashToken(token) } });
      return true;
    });
    if (!created) return { ok: false, error: `You can have up to ${MAX_TOKENS} tokens. Revoke one first.` };
    revalidatePath('/settings');
    return { ok: true, token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create the token.' };
  }
}

/** Revoking deletes the token: requests with it get 401 from then on. */
export async function revokeApiToken(id: unknown): Promise<ActionResult> {
  if (typeof id !== 'string' || !id) return { ok: false, error: 'Not found.' };
  try {
    const user = await requireUser();
    const { count } = await prisma.apiToken.deleteMany({ where: { id, userId: user.id } });
    if (!count) return { ok: false, error: 'Not found.' };
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not revoke the token.' };
  }
}
