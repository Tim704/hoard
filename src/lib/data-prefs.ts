// ───────────────────────────────────────────────────────────────────────────
//  Server-only settings fetchers (not server actions). `prefs` is parsed on
//  every read, so callers always get a complete, valid `Prefs` object.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { DEFAULT_PREFS, parsePrefs, type Prefs } from '@/lib/prefs';
import { perRequest } from '@/lib/request-cache';
import { getCurrentUser } from '@/lib/session';

/**
 * A user's settings, with defaults for anything unset or invalid. Memoised
 * per server-component render (src/lib/request-cache.ts); treat the result
 * as read-only.
 */
export const getPrefs = perRequest(async (userId: string): Promise<Prefs> => {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { prefs: true } });
  return parsePrefs(row?.prefs ?? {});
});

/** The logged-in user's settings (defaults when logged out). */
export async function getCurrentPrefs(): Promise<Prefs> {
  const user = await getCurrentUser();
  return user ? getPrefs(user.id) : parsePrefs(DEFAULT_PREFS);
}

/**
 * Read-modify-write a user's settings atomically: the User row is locked
 * (SELECT … FOR UPDATE) for the transaction, so two saves at once (e.g. a
 * Settings save and "Regenerate calendar link") can't overwrite each other.
 * `change` gets the current settings and returns the new ones, or null to
 * leave them as they are. Resolves to what was stored (or the unchanged
 * current settings) and whether anything was written.
 */
export async function changePrefs(
  userId: string,
  change: (current: Prefs) => Prefs | null,
): Promise<{ prefs: Prefs; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ prefs: unknown }[]>`SELECT prefs FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (!rows.length) throw new Error('User not found.');
    const current = parsePrefs(rows[0].prefs ?? {});
    const next = change(current);
    if (!next) return { prefs: current, changed: false };
    await tx.user.update({ where: { id: userId }, data: { prefs: next } });
    return { prefs: next, changed: true };
  });
}
