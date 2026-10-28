// ───────────────────────────────────────────────────────────────────────────
//  The nightly `metadata` job (spec F2, 03:30): fills release dates, genres,
//  credits, AniList title variants (4.9 backfill), airing info and time to
//  beat for catalogue rows whose `metaFetchedAt` is null or older than 30
//  days. At most 200 rows a night, oldest (never fetched) first, with a short
//  pause between provider calls.
//
//  - Hand-made (`manual:…`) and demo (`demo-…`) rows are never looked up.
//  - Categories whose provider has no key are skipped silently (G4).
//  - AniList rows go in batches of 50 per request; the rest one call each.
//  - A row the provider doesn't know is stamped too, so it waits 30 days
//    instead of eating the budget every night. A failed call leaves the row
//    unstamped for the next run; the job then reports the failures.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import {
  detailsConfigured,
  fetchAniListDetails,
  fetchDetailPatch,
  isLookupSkipped,
  type DetailSource,
} from '@/lib/apis/details';

export const METADATA_MAX_ROWS = 200;
export const METADATA_STALE_DAYS = 30;
export const METADATA_DELAY_MS = 300;

export interface MetadataRow extends DetailSource {
  id: string;
  slug: CategorySlug;
  metaFetchedAt: Date | null;
}

/** Rows fetched before this instant are due again. */
export function staleCutoff(now: Date, days = METADATA_STALE_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * Pick tonight's rows from every category's candidates: skip manual / demo
 * rows and fresh ones, never-fetched first, then the oldest fetch, capped.
 */
export function pickMetadataRows(
  candidates: MetadataRow[],
  now: Date,
  limit = METADATA_MAX_ROWS,
): MetadataRow[] {
  const cutoff = staleCutoff(now).getTime();
  return candidates
    .filter((r) => !isLookupSkipped(r.externalId))
    .filter((r) => r.metaFetchedAt == null || r.metaFetchedAt.getTime() < cutoff)
    .sort((a, b) => (a.metaFetchedAt?.getTime() ?? -1) - (b.metaFetchedAt?.getTime() ?? -1))
    .slice(0, limit);
}

/** The side effects the job needs, injectable for tests. */
export interface MetadataDeps {
  configured: (slug: CategorySlug) => boolean;
  /** Up to `take` due candidates of one category. */
  findDue: (slug: CategorySlug, cutoff: Date, take: number) => Promise<MetadataRow[]>;
  update: (slug: CategorySlug, id: string, data: Record<string, unknown>) => Promise<void>;
  fetchPatch: (slug: CategorySlug, src: DetailSource) => Promise<Record<string, unknown> | null>;
  fetchAniList: (type: 'ANIME' | 'MANGA', ids: string[]) => Promise<Map<string, Record<string, unknown>>>;
  sleep: (ms: number) => Promise<void>;
}

const MODEL: Record<CategorySlug, string> = Object.fromEntries(
  CATEGORY_LIST.map((c) => [c.slug, c.prismaModel]),
) as Record<CategorySlug, string>;

const prismaDeps: MetadataDeps = {
  configured: detailsConfigured,
  async findDue(slug, cutoff, take) {
    // Sanctioned dynamic-Prisma access across the seven media models.
    const rows = await (prisma as any)[MODEL[slug]].findMany({
      where: {
        OR: [{ metaFetchedAt: null }, { metaFetchedAt: { lt: cutoff } }],
        NOT: [{ externalId: { startsWith: 'manual:' } }, { externalId: { startsWith: 'demo-' } }],
      },
      orderBy: [{ metaFetchedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      take,
    });
    return rows.map((r: any) => ({
      id: r.id,
      slug,
      externalId: r.externalId,
      title: r.title,
      artist: r.artist ?? null,
      description: r.description ?? null,
      trackCount: r.trackCount ?? null,
      metaFetchedAt: r.metaFetchedAt ?? null,
    }));
  },
  async update(slug, id, data) {
    await (prisma as any)[MODEL[slug]].update({ where: { id }, data });
  },
  fetchPatch: fetchDetailPatch,
  fetchAniList: fetchAniListDetails,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface MetadataSummary {
  checked: number;
  updated: number;
  notFound: number;
  failed: string[];
}

/** One run of the job. Throws a summary when any lookup failed. */
export async function runMetadata(
  deps: MetadataDeps = prismaDeps,
  now: Date = new Date(),
  opts: { limit?: number; delayMs?: number } = {},
): Promise<MetadataSummary> {
  const limit = opts.limit ?? METADATA_MAX_ROWS;
  const delayMs = opts.delayMs ?? METADATA_DELAY_MS;
  const cutoff = staleCutoff(now);

  const candidates: MetadataRow[] = [];
  for (const { slug } of CATEGORY_LIST) {
    if (!deps.configured(slug)) continue;
    candidates.push(...(await deps.findDue(slug, cutoff, limit)));
  }
  const rows = pickMetadataRows(candidates, now, limit);

  const summary: MetadataSummary = { checked: rows.length, updated: 0, notFound: 0, failed: [] };
  const save = async (row: MetadataRow, patch: Record<string, unknown> | null | undefined) => {
    await deps.update(row.slug, row.id, { ...(patch ?? {}), metaFetchedAt: now });
    if (patch) summary.updated++;
    else summary.notFound++;
  };
  const fail = (row: MetadataRow, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    summary.failed.push(`${row.slug} ${row.externalId}: ${message}`);
  };

  // AniList: a few batched requests cover every anime / manga row.
  for (const slug of ['anime', 'manga'] as const) {
    const batch = rows.filter((r) => r.slug === slug);
    if (!batch.length) continue;
    let found: Map<string, Record<string, unknown>>;
    try {
      found = await deps.fetchAniList(
        slug === 'anime' ? 'ANIME' : 'MANGA',
        batch.map((r) => r.externalId),
      );
    } catch (err) {
      batch.forEach((r) => fail(r, err));
      continue;
    }
    for (const row of batch) {
      try {
        await save(row, found.get(row.externalId) ?? null);
      } catch (err) {
        fail(row, err);
      }
    }
  }

  // Everything else: one provider call per row, with a pause in between.
  let first = true;
  for (const row of rows) {
    if (row.slug === 'anime' || row.slug === 'manga') continue;
    if (!first) await deps.sleep(delayMs);
    first = false;
    try {
      await save(row, await deps.fetchPatch(row.slug, row));
    } catch (err) {
      fail(row, err);
    }
  }

  if (summary.failed.length) {
    const shown = summary.failed.slice(0, 5).join('; ');
    const more = summary.failed.length > 5 ? ` (+${summary.failed.length - 5} more)` : '';
    throw new Error(
      `Metadata: ${summary.failed.length} of ${summary.checked} lookups failed: ${shown}${more}`,
    );
  }
  return summary;
}
