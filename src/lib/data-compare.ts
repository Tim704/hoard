// ───────────────────────────────────────────────────────────────────────────
//  Compare with another user (9.1), server side. Strict privacy (G2):
//    - BOTH users' compareOptIn is re-checked on every request (canCompare),
//      before anything of the other user is read;
//    - an unknown, opted-out or invalid username answers exactly like any
//      other unavailable one, so names can't be probed;
//    - the other user's activities are read with category, catalogue key,
//      score and tier ONLY (never ids, notes, reviews, dates, queues or
//      statuses), and only catalogue rows plus those scores leave here.
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORY_LIST, type CategoryConfig, type CategorySlug } from '@/lib/categories';
import { buildComparison, type CompareEntry, type Compatibility } from '@/lib/compare';
import { isManualId } from '@/lib/manual';
import { parsePrefs, type Prefs } from '@/lib/prefs';
import { prisma } from '@/lib/prisma';
import { displayTitle } from '@/lib/title';
import { canCompare } from '@/lib/together';
import { isTierEligible } from '@/lib/tiers';
import type { Status } from '@/lib/status';

/** At most this many shared titles are listed (the count is always exact). */
export const SHARED_LIST_LIMIT = 300;

export interface CompareTitle {
  slug: CategorySlug;
  title: string;
  imageUrl: string | null;
  year: number | null;
}

export interface SharedView extends CompareTitle {
  myRating: number | null;
  theirRating: number | null;
  /** The viewer's OWN activity (to open its details). */
  myActivityId: string;
}

export interface DisagreementView extends SharedView {
  gap: number;
}

/** A catalogue row the viewer can add (the add row's search-hit shape). */
export interface MissingView extends CompareTitle {
  externalId: string;
  /** The stored title and its variants (for the add path's display title). */
  fields: Record<string, unknown>;
}

export type CompareView =
  | {
      ok: true;
      them: string;
      sharedTotal: number;
      shared: SharedView[];
      disagreements: DisagreementView[];
      compatibility: Compatibility;
      theirS: MissingView[];
    }
  | { ok: false; reason: 'me-off' | 'unavailable' };

/** Select this on an activity to know which catalogue row it points at. */
export const fkSelect = Object.fromEntries(CATEGORY_LIST.map((c) => [c.fkField, true])) as Record<string, true>;
const catByDb = new Map(CATEGORY_LIST.map((c) => [c.dbCategory as string, c]));

/** The catalogue row an activity (selected with `category` and `fkSelect`) points at. */
export function catalogueKeyOf(row: { category: string }): { cat: CategoryConfig; mediaId: string } | null {
  const cat = catByDb.get(row.category);
  const mediaId = cat ? (row as unknown as Record<string, unknown>)[cat.fkField] : null;
  return cat && typeof mediaId === 'string' && mediaId ? { cat, mediaId } : null;
}

/** The key of `loadMedia`'s map. */
export const mediaKey = (slug: CategorySlug, mediaId: string) => `${slug}:${mediaId}`;

function toEntries(rows: Record<string, unknown>[]): (CompareEntry & { id?: string })[] {
  const out: (CompareEntry & { id?: string })[] = [];
  for (const r of rows) {
    const key = catalogueKeyOf(r as { category: string });
    if (!key) continue;
    out.push({
      slug: key.cat.slug,
      mediaId: key.mediaId,
      rating: typeof r.rating === 'number' ? r.rating : null,
      // A tier counts only while it is shown (a finished status), as in the export.
      tier: typeof r.tier === 'string' && isTierEligible(r.status as Status) ? r.tier : null,
      ...(typeof r.id === 'string' ? { id: r.id } : {}),
    });
  }
  return out;
}

type MediaRow = Record<string, unknown>;

/** The section's catalogue model; the seven share the fields read here. */
const mediaModel = (cat: CategoryConfig) =>
  (
    prisma as unknown as Record<
      string,
      { findMany: (a: unknown) => Promise<MediaRow[]>; findUnique: (a: unknown) => Promise<MediaRow | null> }
    >
  )[cat.prismaModel];

/** One catalogue row, or null when it no longer exists. */
export function loadMediaRow(cat: CategoryConfig, mediaId: string): Promise<MediaRow | null> {
  return mediaModel(cat).findUnique({ where: { id: mediaId } });
}

/** Catalogue rows by "slug:id" for the given keys. */
export async function loadMedia(keys: { slug: CategorySlug; mediaId: string }[]) {
  const media = new Map<string, Record<string, unknown>>();
  for (const cat of CATEGORY_LIST as CategoryConfig[]) {
    const ids = [...new Set(keys.filter((k) => k.slug === cat.slug).map((k) => k.mediaId))];
    if (ids.length === 0) continue;
    for (const m of await mediaModel(cat).findMany({ where: { id: { in: ids } } })) media.set(mediaKey(cat.slug, m.id as string), m);
  }
  return media;
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function titleOf(slug: CategorySlug, m: Record<string, unknown>, prefs: Prefs): CompareTitle {
  return {
    slug,
    title: displayTitle(m as never, prefs.titleLanguage),
    imageUrl: str(m.imageUrl),
    year: typeof m.year === 'number' ? m.year : null,
  };
}

/** A catalogue row's stored title and variants, in the add row's search-hit shape. */
export function catalogueFields(m: Record<string, unknown>, externalId: string): Record<string, unknown> {
  return {
    externalId,
    title: str(m.title) ?? '',
    imageUrl: str(m.imageUrl),
    year: typeof m.year === 'number' ? m.year : null,
    ...(str(m.titleEnglish) ? { titleEnglish: m.titleEnglish } : {}),
    ...(str(m.titleRomaji) ? { titleRomaji: m.titleRomaji } : {}),
    ...(str(m.titleNative) ? { titleNative: m.titleNative } : {}),
  };
}

/**
 * Everything /compare/[username] shows, or why it can't. `meId` must not be
 * the other user (the page redirects a self-compare before calling this).
 */
export async function compareLibraries(meId: string, otherUsername: string): Promise<CompareView> {
  const [me, other] = await Promise.all([
    prisma.user.findUnique({ where: { id: meId }, select: { id: true, prefs: true } }),
    typeof otherUsername === 'string' && otherUsername.length > 0 && otherUsername.length <= 100
      ? prisma.user.findUnique({ where: { username: otherUsername }, select: { id: true, username: true, prefs: true } })
      : null,
  ]);
  const myPrefs = parsePrefs(me?.prefs);
  if (!me || !myPrefs.compareOptIn) return { ok: false, reason: 'me-off' };
  const gate = canCompare(
    { id: me.id, compareOptIn: myPrefs.compareOptIn },
    other ? { id: other.id, compareOptIn: parsePrefs(other.prefs).compareOptIn } : null,
  );
  if (!gate || !other) return { ok: false, reason: 'unavailable' };

  const [mineRows, theirRows] = await Promise.all([
    prisma.userMediaActivity.findMany({
      where: { userId: me.id },
      select: { id: true, category: true, status: true, rating: true, tier: true, ...fkSelect },
    }),
    // The other user: catalogue key, score and tier only.
    prisma.userMediaActivity.findMany({
      where: { userId: other.id },
      select: { category: true, status: true, rating: true, tier: true, ...fkSelect },
    }),
  ]);
  const mine = toEntries(mineRows as Record<string, unknown>[]);
  const theirs = toEntries(theirRows as Record<string, unknown>[]);
  const myIds = new Map(mine.map((e) => [mediaKey(e.slug, e.mediaId), e.id!]));
  const cmp = buildComparison(mine, theirs);

  const media = await loadMedia([...cmp.shared, ...cmp.theirSMissing]);
  const sharedViews: SharedView[] = [];
  for (const s of cmp.shared) {
    const m = media.get(mediaKey(s.slug, s.mediaId));
    const myActivityId = myIds.get(mediaKey(s.slug, s.mediaId));
    if (!m || !myActivityId) continue;
    sharedViews.push({ ...titleOf(s.slug, m, myPrefs), myRating: s.myRating, theirRating: s.theirRating, myActivityId });
  }
  sharedViews.sort(
    (a, b) =>
      CATEGORY_LIST.findIndex((c) => c.slug === a.slug) - CATEGORY_LIST.findIndex((c) => c.slug === b.slug) ||
      a.title.localeCompare(b.title),
  );

  const disagreements: DisagreementView[] = [];
  for (const d of cmp.disagreements) {
    const m = media.get(mediaKey(d.slug, d.mediaId));
    const myActivityId = myIds.get(mediaKey(d.slug, d.mediaId));
    if (!m || !myActivityId) continue;
    disagreements.push({ ...titleOf(d.slug, m, myPrefs), myRating: d.myRating, theirRating: d.theirRating, myActivityId, gap: d.gap });
  }

  const theirS: MissingView[] = [];
  for (const t of cmp.theirSMissing) {
    const m = media.get(mediaKey(t.slug, t.mediaId));
    const externalId = m ? str(m.externalId) : null;
    // Hand-made rows (1.5) belong to their maker and can't be added by others.
    if (!m || !externalId || isManualId(externalId)) continue;
    theirS.push({
      ...titleOf(t.slug, m, myPrefs),
      externalId,
      fields: catalogueFields(m, externalId),
    });
  }
  theirS.sort((a, b) => a.slug.localeCompare(b.slug) || a.title.localeCompare(b.title));

  return {
    ok: true,
    them: other.username,
    sharedTotal: sharedViews.length,
    shared: sharedViews.slice(0, SHARED_LIST_LIMIT),
    disagreements,
    compatibility: cmp.compatibility,
    theirS,
  };
}
