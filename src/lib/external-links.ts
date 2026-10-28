// ───────────────────────────────────────────────────────────────────────────
//  Linked outside accounts (spec 8.1–8.3): one ExternalLink row per user and
//  provider. Server-only helpers; callers authenticate. Tokens are stored
//  sealed (src/lib/secret-box.ts) and never leave the server: `publicLink`
//  is the only shape that goes to the client.
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export const PROVIDERS = ['anilist', 'steam', 'lastfm', 'trakt'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface LinkRow {
  id: string;
  userId: string;
  provider: string;
  accountId: string;
  token: string | null;
  data: Prisma.JsonValue | null;
  updatedAt: Date;
}

/** What the browser may see of a link: never the token. */
export interface PublicLink {
  accountId: string;
  /** A display name (Steam persona), when known. */
  name: string | null;
  /** The last sync problem, when there is one. */
  lastError: string | null;
  lastSyncAt: string | null;
  hasToken: boolean;
}

export function linkData(link: Pick<LinkRow, 'data'> | null): Record<string, unknown> {
  const d = link?.data;
  return d && typeof d === 'object' && !Array.isArray(d) ? { ...(d as Record<string, unknown>) } : {};
}

export function publicLink(link: LinkRow | null): PublicLink | null {
  if (!link) return null;
  const d = linkData(link);
  return {
    accountId: link.accountId,
    name: typeof d.name === 'string' ? d.name : null,
    lastError: typeof d.lastError === 'string' ? d.lastError : null,
    lastSyncAt: typeof d.lastSyncAt === 'string' ? d.lastSyncAt : null,
    hasToken: Boolean(link.token),
  };
}

export async function getLink(userId: string, provider: Provider): Promise<LinkRow | null> {
  return prisma.externalLink.findUnique({ where: { userId_provider: { userId, provider } } });
}

/** Create or replace a link (a new account starts with fresh data). */
export async function saveLink(
  userId: string,
  provider: Provider,
  input: { accountId: string; token?: string | null; data?: Record<string, unknown> },
): Promise<void> {
  const data = (input.data ?? {}) as Prisma.InputJsonValue;
  await prisma.externalLink.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, accountId: input.accountId, token: input.token ?? null, data },
    update: { accountId: input.accountId, token: input.token ?? null, data },
  });
}

/**
 * Merge keys into a link's data (a read-modify-write under a row lock, so the
 * nightly job and a click in Settings can't lose each other's change).
 */
export async function patchLinkData(
  userId: string,
  provider: Provider,
  change: (data: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; data: Prisma.JsonValue | null }[]>`
      SELECT id, data FROM "ExternalLink" WHERE "userId" = ${userId} AND provider = ${provider} FOR UPDATE`;
    if (!rows.length) return;
    const next = change(linkData(rows[0]));
    await tx.externalLink.update({ where: { id: rows[0].id }, data: { data: next as Prisma.InputJsonValue } });
  });
}

export async function deleteLink(userId: string, provider: Provider): Promise<void> {
  await prisma.externalLink.deleteMany({ where: { userId, provider } });
}

/** Every user's link of one provider (for the nightly jobs), oldest user first. */
export async function linksOf(provider: Provider): Promise<LinkRow[]> {
  return prisma.externalLink.findMany({ where: { provider }, orderBy: { userId: 'asc' } });
}

/** Record a sync's outcome on the link (error null = it worked). */
export async function recordSync(userId: string, provider: Provider, error: string | null): Promise<void> {
  await patchLinkData(userId, provider, (d) => ({
    ...d,
    lastError: error ? error.slice(0, 300) : null,
    ...(error ? {} : { lastSyncAt: new Date().toISOString() }),
  }));
}
