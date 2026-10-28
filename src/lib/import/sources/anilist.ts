// ───────────────────────────────────────────────────────────────────────────
//  AniList import (spec 2.1): a username's anime and manga lists, fetched on
//  the server through `MediaListCollection` (src/lib/actions/import.ts) and
//  mapped here. Pure, so the mapping is tested on fixture JSON.
//
//  Status: CURRENT → Ongoing, PLANNING → Planned, COMPLETED → Completed,
//  DROPPED → Dropped, PAUSED → Paused, REPEATING → Ongoing (a rewatch, noted
//  in `rewatchCount`). Scores are requested as POINT_10_DECIMAL; 0 means the
//  entry is unscored. Entries also listed under custom lists appear once, with
//  the custom list names as tags.
// ───────────────────────────────────────────────────────────────────────────

import { ymdFromParts } from '@/lib/release';
import type { Status } from '@/lib/status';

import { parseRating } from '../fields';
import type { ParseResult } from '../rows';
import type { ImportRow } from '../types';

export type AniListListType = 'ANIME' | 'MANGA';

/** The collection query (one chunk of up to 500 entries per call). */
export const ANILIST_COLLECTION_QUERY = `
query ($user: String, $type: MediaType, $chunk: Int) {
  MediaListCollection(userName: $user, type: $type, chunk: $chunk, perChunk: 500) {
    hasNextChunk
    lists {
      name
      isCustomList
      entries {
        status
        score(format: POINT_10_DECIMAL)
        progress
        repeat
        notes
        updatedAt
        startedAt { year month day }
        completedAt { year month day }
        media { id idMal title { romaji english } seasonYear startDate { year } }
      }
    }
  }
}`;

interface FuzzyDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export interface AniListEntry {
  status?: string | null;
  score?: number | null;
  progress?: number | null;
  repeat?: number | null;
  notes?: string | null;
  /** Unix seconds of the entry's last change (8.2 conflict rule). */
  updatedAt?: number | null;
  startedAt?: FuzzyDate | null;
  completedAt?: FuzzyDate | null;
  media?: {
    id: number;
    idMal?: number | null;
    title?: { romaji?: string | null; english?: string | null } | null;
    seasonYear?: number | null;
    startDate?: { year?: number | null } | null;
  } | null;
}

export interface AniListCollection {
  hasNextChunk?: boolean | null;
  lists?: Array<{ name?: string | null; isCustomList?: boolean | null; entries?: AniListEntry[] | null }> | null;
}

export const ANILIST_STATUS: Record<string, Status> = {
  CURRENT: 'CONSUMING',
  PLANNING: 'PLANNED',
  COMPLETED: 'COMPLETED',
  DROPPED: 'DROPPED',
  PAUSED: 'ON_HOLD',
  REPEATING: 'CONSUMING',
};

const day = (d?: FuzzyDate | null) => ymdFromParts(d?.year, d?.month, d?.day) ?? undefined;

/** One list entry → an ImportRow (null when it has no media or status). */
export function mapAniListEntry(e: AniListEntry, type: AniListListType): ImportRow | null {
  const m = e.media;
  const status = e.status ? ANILIST_STATUS[e.status] : undefined;
  if (!m || !status) return null;
  const title = m.title?.english?.trim() || m.title?.romaji?.trim();
  if (!title) return null;

  const row: ImportRow = {
    source: 'anilist',
    category: type === 'ANIME' ? 'anime' : 'manga',
    title,
    ids: { anilist: String(m.id), ...(m.idMal != null && { mal: String(m.idMal) }) },
    status,
  };
  const year = m.seasonYear ?? m.startDate?.year;
  if (year) row.year = year;
  const rating = parseRating(e.score ?? undefined, 10);
  if (rating !== undefined) row.rating = rating;
  if (e.progress && e.progress > 0) row.progress = e.progress;
  const repeat = (e.repeat ?? 0) + (e.status === 'REPEATING' ? 1 : 0);
  if (repeat > 0) row.rewatchCount = repeat;
  const startedOn = day(e.startedAt);
  if (startedOn) row.startedOn = startedOn;
  const finishedOn = day(e.completedAt);
  if (finishedOn) row.finishedOn = finishedOn;
  const notes = e.notes?.trim();
  if (notes) row.notes = notes;
  return row;
}

/**
 * Collection chunks → rows, one per media (status lists win; custom lists
 * only add tags, and an entry found only in a custom list is still kept).
 */
export function mapAniListCollection(chunks: AniListCollection[], type: AniListListType): ParseResult {
  const byId = new Map<number, ImportRow>();
  const customTags = new Map<number, string[]>();
  let skipped = 0;
  const lists = chunks.flatMap((c) => c.lists ?? []);
  // Status lists first, so their entry is the one kept.
  const ordered = [...lists.filter((l) => !l.isCustomList), ...lists.filter((l) => l.isCustomList)];
  for (const list of ordered) {
    for (const e of list.entries ?? []) {
      const id = e.media?.id;
      if (list.isCustomList && id != null && list.name?.trim()) {
        const tags = customTags.get(id) ?? [];
        if (!tags.includes(list.name.trim())) tags.push(list.name.trim());
        customTags.set(id, tags);
      }
      if (id == null) {
        if (!list.isCustomList) skipped++;
        continue;
      }
      if (byId.has(id)) continue;
      const row = mapAniListEntry(e, type);
      if (row) byId.set(id, row);
      else skipped++;
    }
  }
  for (const [id, tags] of customTags) {
    const row = byId.get(id);
    if (row) row.tags = [...(row.tags ?? []), ...tags];
  }
  return { rows: [...byId.values()], skipped, warnings: [] };
}

/** A plausible AniList username (letters, digits, _ and -). */
export function validAniListUser(name: string): boolean {
  return /^[A-Za-z0-9_-]{2,32}$/.test(name.trim());
}
