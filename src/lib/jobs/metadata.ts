// ───────────────────────────────────────────────────────────────────────────
//  The nightly `metadata` job (spec F2, 03:30): fills release dates, genres,
//  credits, AniList title variants (4.9 backfill), airing info and time to
//  beat for catalogue rows whose `metaFetchedAt` is null or older than 30
//  days. At most 1000 rows a night: never-fetched rows first (TV first, since
//  its lookup also stores the seasons), then stale ones,
//  then rows whose last lookup failed (retried at most every 3 days, so a row
//  that keeps failing can't starve the budget). A pause between rows keeps
//  IGDB (2 requests a row) under its 4 requests/second limit.
//
//  - Hand-made (`manual:…`) and demo (`demo-…`) rows are never looked up.
//  - Categories whose provider has no key are skipped silently (G4).
//  - AniList rows go in batches of 50 per request; the rest one call each.
//  - A row the provider doesn't know is stamped too, so it waits 30 days
//    instead of eating the budget every night. A failed call sets
//    `metaFailedAt` instead (leaving `metaFetchedAt`), and the job reports
//    the failures. A later success clears `metaFailedAt`.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import {
  detailsConfigured,
  fetchAniListDetails,
  fetchDetailPatch,
  isLookupSkipped,
  splitSeasons,
  type DetailSource,
} from '@/lib/apis/details';
import { saveTvSeasons } from '@/lib/library/tv-seasons';

// 1000 rows × 600 ms ≈ 10 minutes a night. The first run after a deploy finds
// every row never-fetched, so the cap is generous.
export const METADATA_MAX_ROWS = 1000;
export const METADATA_STALE_DAYS = 30;
export const METADATA_FAILED_RETRY_DAYS = 3;
/** ≥ 500 ms per row → IGDB's 2 requests a row stay under 4 requests/second. */
export const METADATA_DELAY_MS = 600;

export interface MetadataRow extends DetailSource {
  id: string;
  slug: CategorySlug;
  metaFetchedAt: Date | null;
  metaFailedAt: Date | null;
}

/** Rows fetched before this instant are due again. */
export function staleCutoff(now: Date, days = METADATA_STALE_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** Rows whose lookup failed after this instant wait (no retry yet). */
export function failedCutoff(now: Date, days = METADATA_FAILED_RETRY_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** Among never-fetched rows TV goes first: its lookup also brings the seasons (3.3). */
const slugRank = (r: MetadataRow) => (r.slug === 'tv' ? 0 : 1);

/** 0 = never fetched, 1 = stale, 2 = last lookup failed. */
function priority(r: MetadataRow): number {
  if (r.metaFailedAt) return 2;
  return r.metaFetchedAt ? 1 : 0;
}

/**
 * Pick tonight's rows from every category's candidates: skip manual / demo
 * rows, fresh ones and recently failed ones; then never-fetched rows, stale
 * rows (oldest fetch first) and finally failed rows (oldest failure first),
 * capped at `limit`.
 */
export function pickMetadataRows(
  candidates: MetadataRow[],
  now: Date,
  limit = METADATA_MAX_ROWS,
): MetadataRow[] {
  const stale = staleCutoff(now).getTime();
  const failed = failedCutoff(now).getTime();
  const time = (r: MetadataRow) => (r.metaFailedAt ?? r.metaFetchedAt)?.getTime() ?? 0;
  return candidates
    .filter((r) => !isLookupSkipped(r.externalId))
    .filter((r) => r.metaFetchedAt == null || r.metaFetchedAt.getTime() < stale)
    .filter((r) => r.metaFailedAt == null || r.metaFailedAt.getTime() < failed)
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        (priority(a) === 0 ? slugRank(a) - slugRank(b) : 0) ||
        time(a) - time(b),
    )
    .slice(0, limit);
}

/** The side effects the job needs, injectable for tests. */
export interface MetadataDeps {
  configured: (slug: CategorySlug) => boolean;
  /** Up to `take` due candidates of one category. */
  findDue: (slug: CategorySlug, staleBefore: Date, failedBefore: Date, take: number) => Promise<MetadataRow[]>;
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
  async findDue(slug, staleBefore, failedBefore, take) {
    // Sanctioned dynamic-Prisma access across the seven media models.
    const rows = await (prisma as any)[MODEL[slug]].findMany({
      where: {
        AND: [
          { OR: [{ metaFetchedAt: null }, { metaFetchedAt: { lt: staleBefore } }] },
          { OR: [{ metaFailedAt: null }, { metaFailedAt: { lt: failedBefore } }] },
        ],
        NOT: [{ externalId: { startsWith: 'manual:' } }, { externalId: { startsWith: 'demo-' } }],
      },
      // Not-failed rows first (never fetched, then oldest), failed rows last.
      orderBy: [
        { metaFailedAt: { sort: 'asc', nulls: 'first' } },
        { metaFetchedAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
      ],
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
      metaFailedAt: r.metaFailedAt ?? null,
    }));
  },
  async update(slug, id, data) {
    // A TV patch carries the show's seasons (3.3): they refresh `TvSeason`.
    const { columns, seasons } = splitSeasons(data);
    await (prisma as any)[MODEL[slug]].update({ where: { id }, data: columns });
    if (slug === 'tv' && seasons?.length) await saveTvSeasons(prisma, id, seasons);
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
  const staleBefore = staleCutoff(now);
  const failedBefore = failedCutoff(now);

  const candidates: MetadataRow[] = [];
  for (const { slug } of CATEGORY_LIST) {
    if (!deps.configured(slug)) continue;
    candidates.push(...(await deps.findDue(slug, staleBefore, failedBefore, limit)));
  }
  const rows = pickMetadataRows(candidates, now, limit);

  const summary: MetadataSummary = { checked: rows.length, updated: 0, notFound: 0, failed: [] };
  const save = async (row: MetadataRow, patch: Record<string, unknown> | null | undefined) => {
    await deps.update(row.slug, row.id, { ...(patch ?? {}), metaFetchedAt: now, metaFailedAt: null });
    if (patch) summary.updated++;
    else summary.notFound++;
  };
  const fail = async (row: MetadataRow, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    summary.failed.push(`${row.slug} ${row.externalId}: ${message}`);
    try {
      await deps.update(row.slug, row.id, { metaFailedAt: now });
    } catch {
      // Recording the failure is best-effort; the summary still reports it.
    }
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
      for (const r of batch) await fail(r, err);
      continue;
    }
    for (const row of batch) {
      try {
        await save(row, found.get(row.externalId) ?? null);
      } catch (err) {
        await fail(row, err);
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
      await fail(row, err);
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
