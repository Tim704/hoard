// ───────────────────────────────────────────────────────────────────────────
//  Server-only settings fetchers (not server actions). `prefs` is parsed on
//  every read, so callers always get a complete, valid `Prefs` object.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { DEFAULT_PREFS, parsePrefs, type Prefs } from '@/lib/prefs';
import { getCurrentUser } from '@/lib/session';

/** A user's settings, with defaults for anything unset or invalid. */
export async function getPrefs(userId: string): Promise<Prefs> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { prefs: true } });
  return parsePrefs(row?.prefs ?? {});
}

/** The logged-in user's settings (defaults when logged out). */
export async function getCurrentPrefs(): Promise<Prefs> {
  const user = await getCurrentUser();
  return user ? getPrefs(user.id) : parsePrefs(DEFAULT_PREFS);
}
