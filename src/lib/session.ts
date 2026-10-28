// ───────────────────────────────────────────────────────────────────────────
//  Session management — opaque random tokens stored in a `Session` row and
//  mirrored into an httpOnly cookie. Server-only module (NOT 'use server'):
//  imported by server actions, route handlers, and server components.
//
//  NOTE: only the cookie-MUTATING helpers (createSessionForUser / destroySession)
//  may be called from a server action or route handler — never during RSC render.
//  getCurrentUser / requireUser only READ the cookie and are safe anywhere.
// ───────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { perRequest } from '@/lib/request-cache';

export const SESSION_COOKIE = 'hoard_session';

/** Session lifetime: 30 days. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Create a fresh session for the given user: generate a random token, persist a
 * `Session` row (expiring in 30 days), and set the httpOnly session cookie.
 * Must be called from a server action or route handler (it mutates cookies).
 */
export async function createSessionForUser(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      id: token,
      userId,
      expiresAt: expires,
    },
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
}

/**
 * Resolve the currently logged-in user from the session cookie, or `null` if
 * there is no cookie / no valid (non-expired) session. Memoised per
 * server-component render (layout + page + components share one lookup);
 * actions and route handlers always read afresh (src/lib/request-cache.ts).
 */
export const getCurrentUser = perRequest(async (): Promise<{ id: string; username: string } | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });

  // Reject missing or expired sessions.
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return { id: session.user.id, username: session.user.username };
});

/**
 * Like `getCurrentUser`, but redirects to `/login` when there is no valid
 * session instead of returning `null`.
 */
export async function requireUser(): Promise<{ id: string; username: string }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

/**
 * Destroy the current session: delete the matching `Session` row and clear the
 * cookie. Safe to call even when there is no active session.
 * Must be called from a server action or route handler (it mutates cookies).
 */
export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;

  if (token) {
    // The row may already be gone (e.g. expired & swept); ignore that case.
    await prisma.session.deleteMany({ where: { id: token } });
  }

  cookies().delete(SESSION_COOKIE);
}
