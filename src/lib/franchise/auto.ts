// Server-only helpers that tie resolution (network) and grouping (DB) together.

import { prisma } from '@/lib/prisma';
import { getCategory, type CategorySlug } from '@/lib/categories';
import { resolveFranchise } from './resolve';
import { syncUserFranchises } from './sync';

interface MediaRowRef {
  id: string;
  externalId: string;
  title: string;
  franchiseName?: string | null;
}

/**
 * Resolve one catalogue row's franchise and store it on the row. A row whose
 * `franchiseName` is already set has been resolved before and is skipped.
 * Returns false when the provider failed (left unresolved for a later retry).
 */
export async function resolveMediaRow(slug: CategorySlug, media: MediaRowRef): Promise<boolean> {
  if (media.franchiseName) return true;
  const cat = getCategory(slug);
  if (!cat) return false;

  const info = await resolveFranchise(slug, media);
  if (!info) return false;
  await (prisma as any)[cat.prismaModel].update({
    where: { id: media.id },
    data: { franchiseKey: info.key, franchiseName: info.name },
  });
  return true;
}

/**
 * After a title is added: resolve its franchise (bounded by a timeout so a slow
 * provider never stalls the add) and regroup the user's library. Never throws.
 */
export async function autoGroupAfterAdd(
  userId: string,
  slug: CategorySlug,
  media: MediaRowRef,
): Promise<void> {
  try {
    await Promise.race([
      resolveMediaRow(slug, media),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    await syncUserFranchises(userId);
  } catch {
    // Grouping is a nicety; the add itself already succeeded.
  }
}
