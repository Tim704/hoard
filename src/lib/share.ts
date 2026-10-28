// ───────────────────────────────────────────────────────────────────────────
//  Share links (spec 4.1): the access rules, pure and client-safe.
//
//  A ShareLink makes ONE thing of one user public at /s/[token]: a section's
//  tier list now (kind "tiers", target = section slug); a year in review
//  ("year", target "2026", Task 15) and a custom list ("list", target = list
//  id, Task 12) plug into the same mechanism. The token is the row id: 144
//  random bits, base64url. A revoked or unknown token answers exactly like a
//  missing page (404), so a token's existence never leaks.
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORY_SLUGS } from '@/lib/categories';

export const SHARE_KINDS = ['tiers', 'year', 'list'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export const isShareKind = (v: unknown): v is ShareKind =>
  typeof v === 'string' && (SHARE_KINDS as readonly string[]).includes(v);

/** 18 random bytes = 144 bits → 24 base64url characters. */
export const SHARE_TOKEN_BYTES = 18;

/** base64url of random bytes (no padding). */
export function encodeShareToken(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A fresh random token (Web Crypto: works on the server and in tests). */
export function newShareToken(): string {
  const bytes = new Uint8Array(SHARE_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return encodeShareToken(bytes);
}

/**
 * Whether a path segment can be a token at all (checked before any database
 * read). Allows the fixed dev seed token "demo-share-books".
 */
export function isShareTokenShape(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

/** Whether `target` names something of that kind (format only; ownership is checked separately). */
export function isValidShareTarget(kind: ShareKind, target: unknown): target is string {
  if (typeof target !== 'string') return false;
  switch (kind) {
    case 'tiers':
      // Not `in CATEGORIES`: that is also true for "toString".
      return (CATEGORY_SLUGS as string[]).includes(target);
    case 'year':
      return /^\d{4}$/.test(target) && Number(target) >= 1900 && Number(target) <= 2999;
    case 'list':
      return /^[A-Za-z0-9_-]{1,64}$/.test(target);
  }
}

export interface ShareLinkRow {
  id: string;
  userId: string;
  kind: string;
  target: string;
  revokedAt: Date | null;
}

/**
 * The link a public visit may show, or null (→ 404) when the token is
 * unknown, revoked, or of a kind/target this build cannot show.
 */
export function publicShare<T extends ShareLinkRow>(
  link: T | null,
): (T & { kind: ShareKind }) | null {
  if (!link || link.revokedAt !== null) return null;
  if (!isShareKind(link.kind) || !isValidShareTarget(link.kind, link.target)) return null;
  return link as T & { kind: ShareKind };
}

/** Only the owner may revoke (or reuse) a link. */
export function canManageShare(link: Pick<ShareLinkRow, 'userId'> | null, userId: string): boolean {
  return link !== null && link.userId === userId;
}

/**
 * Which existing link "Share link" hands back instead of creating a new one:
 * the user's newest active link for the same kind and target.
 */
export function reusableShare<T extends ShareLinkRow & { createdAt: Date }>(
  links: readonly T[],
  userId: string,
  kind: ShareKind,
  target: string,
): T | null {
  const active = links
    .filter((l) => l.userId === userId && l.kind === kind && l.target === target && l.revokedAt === null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return active[0] ?? null;
}

/** The public path of a link. */
export const sharePath = (token: string): string => `/s/${token}`;

/** The tier list PNG's file name: hoard-books-tiers-2026-10-28.png. */
export const tierPngFileName = (section: string, ymd: string): string => `hoard-${section}-tiers-${ymd}.png`;

/** The year in review PNG's file name: hoard-2026-in-review.png. */
export const yearPngFileName = (year: number): string => `hoard-${year}-in-review.png`;
