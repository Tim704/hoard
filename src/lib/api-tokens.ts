// ───────────────────────────────────────────────────────────────────────────
//  Public API tokens (spec 8.7). Pure apart from `randomBytes`/`createHash`
//  (node:crypto); server-only.
//
//  A token is `hoard_` + 32 random bytes in base64url (43 characters). Only
//  its SHA-256 hash (hex) is stored, under a unique index: a request's token
//  is hashed and looked up by that hash, so no stored secret is ever compared
//  byte by byte (nothing to time). The token itself is shown once, when it is
//  created. Requests carry it as `Authorization: Bearer hoard_…`.
//
//  Paging: lists are ordered by (createdAt, id) and the cursor is that pair
//  of the last item, base64url-encoded JSON. A cursor that doesn't decode is
//  a 400, never a silent restart.
// ───────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'node:crypto';

import { MAX_TOKEN_NAME } from './api-token-limits';

export { MAX_TOKEN_NAME, MAX_TOKENS } from './api-token-limits';

export const TOKEN_PREFIX = 'hoard_';
/** lastUsedAt is written at most this often per token. */
export const TOUCH_EVERY_MS = 60_000;

const TOKEN_SHAPE = /^hoard_[A-Za-z0-9_-]{43}$/;

/** A fresh token (the only time it exists in clear). */
export function generateToken(bytes: Buffer = randomBytes(32)): string {
  return TOKEN_PREFIX + bytes.toString('base64url');
}

/** The stored form of a token: SHA-256, hex. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isTokenShape(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

export type BearerResult = { kind: 'missing' } | { kind: 'malformed' } | { kind: 'token'; token: string };

/** Read `Authorization: Bearer <token>` (the scheme in any case). */
export function parseBearer(header: string | null | undefined): BearerResult {
  if (!header || !header.trim()) return { kind: 'missing' };
  const m = /^\s*bearer\s+(\S+)\s*$/i.exec(header);
  if (!m || !isTokenShape(m[1])) return { kind: 'malformed' };
  return { kind: 'token', token: m[1] };
}

/** A cleaned token name (1–40 characters), or null. */
export function cleanTokenName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return Array.from(name).slice(0, MAX_TOKEN_NAME).join('').trim();
}

/** Whether a request should update lastUsedAt (at most once a minute). */
export function shouldTouch(lastUsedAt: Date | null, now: Date): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= TOUCH_EVERY_MS;
}

// ── Paging ──────────────────────────────────────────────────────────────────

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

/** `?limit=` → 1–100 (default 50), or null when it isn't a whole number. */
export function parseLimit(raw: string | null): number | null {
  if (raw == null || raw === '') return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n < 1 ? null : Math.min(n, MAX_LIMIT);
}

export interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify({ t: c.createdAt.toISOString(), i: c.id }), 'utf8').toString('base64url');
}

/** The cursor in `raw`, or null when it is not one of ours. */
export function decodeCursor(raw: string): Cursor | null {
  if (!/^[A-Za-z0-9_-]{1,400}$/.test(raw)) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!v || typeof v.t !== 'string' || typeof v.i !== 'string' || !v.i || v.i.length > 100) return null;
    const createdAt = new Date(v.t);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: v.i };
  } catch {
    return null;
  }
}

/**
 * One page from rows fetched with `take: limit + 1` in (createdAt, id)
 * order: the first `limit` rows and the cursor for the next page, if any.
 */
export function pageOf<T extends Cursor>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}
