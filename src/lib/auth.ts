// ───────────────────────────────────────────────────────────────────────────
//  Password hashing + user credential helpers. Server-only module (NOT
//  'use server'): bcryptjs and prisma must never reach a client component.
// ───────────────────────────────────────────────────────────────────────────

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-error';

const SALT_ROUNDS = 10;

/** Hash a plaintext password with bcrypt (10 rounds). */
export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, SALT_ROUNDS);
}

/** Verify a plaintext password against a stored bcrypt hash. */
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/**
 * Create a new user with the given credentials.
 * @throws if the username is already taken.
 */
export async function createUser(
  username: string,
  password: string,
): Promise<{ id: string; username: string }> {
  // Case-insensitive: "Tim" can't be registered next to "tim".
  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) {
    throw new UserError('That username is already taken.');
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { username, passwordHash },
  });

  return { id: user.id, username: user.username };
}

/**
 * Verify a username/password pair. Returns the user on success, or `null` when
 * the user does not exist or the password is wrong.
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<{ id: string; username: string } | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  return { id: user.id, username: user.username };
}
