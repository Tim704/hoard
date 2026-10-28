// ───────────────────────────────────────────────────────────────────────────
//  Share links (spec 4.1): server-only loaders (not server actions).
//
//  A public visit to /s/[token] goes through `loadPublicShare`: token shape,
//  then the row, then the access rules (src/lib/share.ts), then the loader
//  registered for the link's kind. Each loader returns ONLY what the public
//  page shows — for a tier list: the section, and per tier the titles (in the
//  owner's title language) and covers in order. Never notes, scores, dates or
//  anything else of the owner's library. Task 12 (lists) and Task 15 (year in
//  review) add their kinds to SHARE_LOADERS.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { getCategory, type CategorySlug } from '@/lib/categories';
import { flattenActivity } from '@/lib/data';
import { getPrefs } from '@/lib/data-prefs';
import { absoluteUrl } from '@/lib/public-url';
import {
  isShareTokenShape,
  publicShare,
  sharePath,
  type ShareKind,
  type ShareLinkRow,
} from '@/lib/share';
import { buildTierBoard, TIERS, type Tier } from '@/lib/tiers';
import { displayTitle } from '@/lib/title';
import type { ActivityWithMedia } from '@/lib/types';

/** One title as a public page shows it. */
export interface SharedItem {
  title: string;
  /** https cover URL from the provider CDN, or null. */
  imageUrl: string | null;
}

export interface TiersShareView {
  kind: 'tiers';
  section: CategorySlug;
  sectionLabel: string;
  tiers: { tier: Tier; items: SharedItem[] }[];
}

/** What each kind's public page renders. Year and list views join in Tasks 15 and 12. */
export interface ShareViews {
  tiers: TiersShareView;
}

export type ShareView = ShareViews[keyof ShareViews];

type Loader<V> = (link: ShareLinkRow & { kind: ShareKind }) => Promise<V | null>;

/** The loader per kind; a kind without one is not shareable yet (its links 404). */
export const SHARE_LOADERS: { [K in ShareKind]?: Loader<K extends keyof ShareViews ? ShareViews[K] : never> } = {
  tiers: loadTiers,
};

/** Kinds "Share link" may create now. */
export const shareableKind = (kind: ShareKind): boolean => SHARE_LOADERS[kind] !== undefined;

const httpsOnly = (url: string | null | undefined): string | null =>
  typeof url === 'string' && /^https:\/\//i.test(url) ? url : null;

async function loadTiers(link: ShareLinkRow): Promise<TiersShareView | null> {
  const cat = getCategory(link.target);
  if (!cat) return null;
  const [rows, prefs] = await Promise.all([
    prisma.userMediaActivity.findMany({
      where: { userId: link.userId, category: cat.dbCategory, tier: { not: null } },
      include: { [cat.prismaModel]: true } as any,
    }),
    getPrefs(link.userId),
  ]);
  const activities = rows
    .map((row) => flattenActivity(row, cat))
    .filter((a): a is ActivityWithMedia => a !== null);
  const board = buildTierBoard(activities);
  return {
    kind: 'tiers',
    section: cat.slug,
    sectionLabel: cat.label,
    tiers: TIERS.map((tier) => ({
      tier,
      items: board.tiers[tier].map((a) => ({
        title: displayTitle(a.media, prefs.titleLanguage),
        imageUrl: httpsOnly(a.media.imageUrl),
      })),
    })),
  };
}

/**
 * The public view behind a token, or null for anything that must 404:
 * malformed, unknown, revoked, or of a kind without a loader.
 */
export async function loadPublicShare(token: string): Promise<ShareView | null> {
  if (!isShareTokenShape(token)) return null;
  const row = await prisma.shareLink.findUnique({ where: { id: token } });
  const link = publicShare(row);
  if (!link) return null;
  const loader = SHARE_LOADERS[link.kind] as Loader<ShareView> | undefined;
  return loader ? loader(link) : null;
}

/** A row of Settings → Sharing. */
export interface MyShareLink {
  id: string;
  kind: ShareKind;
  target: string;
  label: string;
  url: string;
  createdAt: string;
}

/** What a link shows, in words ("Books tier list"). */
export function shareLabel(kind: string, target: string): string {
  if (kind === 'tiers') return `${getCategory(target)?.label ?? target} tier list`;
  if (kind === 'year') return `${target} in review`;
  if (kind === 'list') return 'Custom list';
  return kind;
}

/** The user's active links, newest first. */
export async function getMyShareLinks(userId: string): Promise<MyShareLink[]> {
  const rows = await prisma.shareLink.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return rows
    .map((r) => publicShare(r))
    .filter((r): r is NonNullable<typeof r> & { createdAt: Date } => r !== null)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      target: r.target,
      label: shareLabel(r.kind, r.target),
      url: absoluteUrl(sharePath(r.id)),
      createdAt: r.createdAt.toISOString(),
    }));
}
