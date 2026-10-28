// ───────────────────────────────────────────────────────────────────────────
//  The public API's response shapes (spec 8.7, documented in docs/API.md).
//  Pure: an explicit allowlist of fields, so a column added later stays out
//  until someone decides it belongs in the API. Hidden internals (Arena Elo,
//  rank and queue order numbers, user ids) never appear; positions are
//  1-based places instead.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';
import type { Status } from './status';
import { TIERS, type TierBoardData } from './tiers';
import type { ActivityWithMedia } from './types';
import { isTierEligible } from '@/lib/tiers';

export interface ApiMedia {
  externalId: string;
  title: string;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  year: number | null;
  releaseDate: string | null;
  imageUrl: string | null;
  genres: string[];
}

export interface ApiActivity {
  id: string;
  category: CategorySlug;
  status: Status;
  score: number | null;
  tier: string | null;
  favourite: boolean;
  progress: number | null;
  tags: string[];
  notes: string | null;
  franchise: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  media: ApiMedia;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function apiMedia(m: ActivityWithMedia['media']): ApiMedia {
  return {
    externalId: m.externalId,
    title: m.title,
    titleEnglish: str(m.titleEnglish),
    titleRomaji: str(m.titleRomaji),
    titleNative: str(m.titleNative),
    year: m.year ?? null,
    releaseDate: str(m.releaseDate),
    imageUrl: m.imageUrl ?? null,
    genres: Array.isArray(m.genres) ? m.genres.filter((g): g is string => typeof g === 'string') : [],
  };
}

export function apiActivity(
  a: ActivityWithMedia,
  dates: { startedAt: Date | string | null; finishedAt: Date | string | null } = { startedAt: null, finishedAt: null },
): ApiActivity {
  const iso = (d: Date | string | null) => (d == null ? null : typeof d === 'string' ? d : d.toISOString());
  return {
    id: a.id,
    category: a.category,
    status: a.status,
    score: a.rating,
    // Only a shown tier (finished statuses), as in the export.
    tier: a.tier && isTierEligible(a.status) ? a.tier : null,
    favourite: a.favorite,
    progress: a.progress,
    tags: a.tags,
    notes: a.notes,
    franchise: a.franchise?.name ?? null,
    startedAt: iso(dates.startedAt),
    finishedAt: iso(dates.finishedAt),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    media: apiMedia(a.media),
  };
}

/** A title on a tier list or in Up next: just enough to show it. */
export interface ApiListItem {
  id: string;
  position: number;
  title: string;
  year: number | null;
  score: number | null;
  status: Status;
  imageUrl: string | null;
}

function listItem(a: ActivityWithMedia, position: number): ApiListItem {
  return {
    id: a.id,
    position,
    title: a.media.title,
    year: a.media.year ?? null,
    score: a.rating,
    status: a.status,
    imageUrl: a.media.imageUrl ?? null,
  };
}

/** The tier list: tiers S→F with 1-based places, and the unranked tray. */
export function apiTiers(category: CategorySlug, board: TierBoardData) {
  const tiers = Object.fromEntries(TIERS.map((t) => [t, board.tiers[t].map((a, i) => listItem(a, i + 1))]));
  return { category, tiers, unranked: board.tray.map((a, i) => listItem(a, i + 1)) };
}

/** Up next in order, 1-based. */
export function apiQueue(category: CategorySlug, queue: ActivityWithMedia[]) {
  return { category, items: queue.map((a, i) => listItem(a, i + 1)) };
}
