// ───────────────────────────────────────────────────────────────────────────
//  Unreleased sequels (spec 5.6): the AniList entries of a franchise's IP that
//  are announced but not out yet (status NOT_YET_RELEASED with a full start
//  day). The `new-seasons` job walks the relation graph (the same walk as
//  "Add missing titles", src/lib/franchise/missing.ts) and caches the result
//  on `Franchise.upcoming`; the calendar reads it. Pure and client-safe.
// ───────────────────────────────────────────────────────────────────────────

import { mapAnime, mapManga } from '@/lib/apis/anilist';
import { isYmd, ymdFromParts } from '@/lib/release';

import type { AniListGraphNode } from './missing';

/** One cached unreleased entry. `slug` is anime or manga. */
export interface UpcomingEntry {
  slug: 'anime' | 'manga';
  externalId: string;
  title: string;
  /** Start day, YYYY-MM-DD. */
  date: string;
  imageUrl: string | null;
  format: string | null;
}

export interface UpcomingCache {
  /** ISO time of the last refresh. */
  fetchedAt: string;
  items: UpcomingEntry[];
}

/** A graph node with its release status (asked for on top of GRAPH_FIELDS). */
export interface StatusNode extends AniListGraphNode {
  status?: string | null;
}

/**
 * The not-yet-released entries among the walked nodes: a full start day on
 * or after `today` (a past day for an unreleased entry is stale data), no
 * adult entries or music videos, one per entry, soonest first.
 */
export function extractUpcoming(nodes: readonly StatusNode[], today: string): UpcomingEntry[] {
  const out = new Map<string, UpcomingEntry>();
  for (const n of nodes) {
    if (n.status !== 'NOT_YET_RELEASED' || n.isAdult || n.format === 'MUSIC') continue;
    if (n.type !== 'ANIME' && n.type !== 'MANGA') continue;
    const date = ymdFromParts(n.startDate?.year, n.startDate?.month, n.startDate?.day);
    if (!date || date < today) continue;
    const slug = n.type === 'ANIME' ? 'anime' : 'manga';
    const r = slug === 'anime' ? mapAnime(n) : mapManga(n);
    const key = `${slug}|${r.externalId}`;
    if (out.has(key)) continue;
    out.set(key, { slug, externalId: r.externalId, title: r.title, date, imageUrl: r.imageUrl, format: n.format ?? null });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Read the stored JSON defensively (anything malformed is dropped). */
export function parseUpcoming(raw: unknown): UpcomingCache | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const items: UpcomingEntry[] = [];
  for (const it of Array.isArray(o.items) ? o.items : []) {
    if (!it || typeof it !== 'object') continue;
    const e = it as Record<string, unknown>;
    if ((e.slug !== 'anime' && e.slug !== 'manga') || typeof e.externalId !== 'string' || typeof e.title !== 'string') continue;
    if (!isYmd(e.date)) continue;
    items.push({
      slug: e.slug,
      externalId: e.externalId,
      title: e.title,
      date: e.date,
      imageUrl: typeof e.imageUrl === 'string' ? e.imageUrl : null,
      format: typeof e.format === 'string' ? e.format : null,
    });
  }
  return { fetchedAt: typeof o.fetchedAt === 'string' ? o.fetchedAt : '', items };
}
