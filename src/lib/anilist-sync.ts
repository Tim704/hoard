// ───────────────────────────────────────────────────────────────────────────
//  AniList sync (spec 8.2), the pure half: which pulled entries change what,
//  the "most recent change wins" rule, and what a push sends. The server half
//  (fetching, writing, the push queue) is src/lib/anilist-sync-server.ts.
//
//  Pull, per AniList entry the user already has in Hoard:
//    AniList changed it after Hoard did → its status (only ever forward),
//      score and progress are taken over;
//    Hoard changed it last → nothing is overwritten; only an empty score or
//      progress is filled in.
//  Entries not in the library yet are added like an AniList import. Nothing
//  is ever removed.
// ───────────────────────────────────────────────────────────────────────────

import { STATUS_RANK } from '@/lib/import/rows';
import { mapAniListEntry, type AniListCollection, type AniListListType } from '@/lib/import/sources/anilist';
import type { ImportRow } from '@/lib/import/types';
import type { Status } from '@/lib/status';

export interface PulledEntry {
  row: ImportRow;
  /** AniList media id. */
  mediaId: number;
  /** When the entry last changed on AniList (ms), null when unknown. */
  updatedAt: number | null;
}

/** Collection chunks → one entry per media (status lists only; custom lists add nothing to sync). */
export function pulledEntries(chunks: AniListCollection[], type: AniListListType): PulledEntry[] {
  const out = new Map<number, PulledEntry>();
  for (const list of chunks.flatMap((c) => c.lists ?? [])) {
    if (list.isCustomList) continue;
    for (const e of list.entries ?? []) {
      const id = e.media?.id;
      if (id == null || out.has(id)) continue;
      const row = mapAniListEntry(e, type);
      if (!row) continue;
      row.source = 'anilist-sync';
      const at = typeof e.updatedAt === 'number' && e.updatedAt > 0 ? e.updatedAt * 1000 : null;
      out.set(id, { row, mediaId: id, updatedAt: at });
    }
  }
  return [...out.values()];
}

/** The catalogue keys an entry can be stored under (MAL id first, then `al-`). */
export function catalogueKeys(row: ImportRow): string[] {
  return [...(row.ids.mal ? [row.ids.mal] : []), ...(row.ids.anilist ? [`al-${row.ids.anilist}`] : [])];
}

export interface LocalState {
  status: Status;
  rating: number | null;
  progress: number | null;
  updatedAt: Date;
}

export interface SyncChange {
  status?: Status;
  rating?: number;
  progress?: number;
}

/**
 * What a pulled entry changes on the local activity (empty = nothing).
 * `remoteAt` null (unknown) counts as older than Hoard.
 */
export function resolveConflict(local: LocalState, remote: ImportRow, remoteAt: number | null): SyncChange {
  const change: SyncChange = {};
  const remoteNewer = remoteAt != null && remoteAt > local.updatedAt.getTime();
  if (remoteNewer) {
    // Statuses AniList can't tell apart (Retired is pushed as Completed) are
    // the same status: pulling one back must not overwrite the other.
    const same = toAniListStatus(remote.status) === toAniListStatus(local.status);
    if (!same && STATUS_RANK[remote.status] > STATUS_RANK[local.status]) change.status = remote.status;
    if (remote.rating != null && remote.rating !== local.rating) change.rating = remote.rating;
    if (remote.progress != null && remote.progress !== local.progress) change.progress = remote.progress;
  } else {
    if (local.rating == null && remote.rating != null) change.rating = remote.rating;
    if (local.progress == null && remote.progress != null) change.progress = remote.progress;
  }
  return change;
}

// ── Push ───────────────────────────────────────────────────────────────────

export type AniListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';

/** Hoard → AniList list status. Retired (an endless title put down) counts as Completed. */
export function toAniListStatus(status: Status, rewatching = false): AniListStatus {
  switch (status) {
    case 'PLANNED':
      return 'PLANNING';
    case 'CONSUMING':
      return rewatching ? 'REPEATING' : 'CURRENT';
    case 'COMPLETED':
    case 'RETIRED':
      return 'COMPLETED';
    case 'ON_HOLD':
      return 'PAUSED';
    case 'DROPPED':
      return 'DROPPED';
  }
}

export interface PushVariables {
  mediaId: number;
  status: AniListStatus;
  /** 0–100 regardless of the user's AniList score format; 0 = unscored. */
  scoreRaw: number;
  progress?: number;
}

export function pushVariables(
  mediaId: number,
  a: { status: Status; rating: number | null; progress: number | null; rewatching?: boolean },
): PushVariables {
  const vars: PushVariables = {
    mediaId,
    status: toAniListStatus(a.status, a.rewatching),
    scoreRaw: a.rating == null ? 0 : Math.max(0, Math.min(100, Math.round(a.rating * 10))),
  };
  if (a.progress != null && a.progress >= 0) vars.progress = a.progress;
  return vars;
}

export const SAVE_ENTRY_MUTATION = `
mutation ($mediaId: Int, $status: MediaListStatus, $scoreRaw: Int, $progress: Int) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $scoreRaw, progress: $progress) { id updatedAt }
}`;

/** The AniList media id behind a catalogue key: `al-123` directly, a MAL id needs a lookup. */
export function aniListIdFromKey(externalId: string): { al: number } | { mal: number } | null {
  const al = /^al-(\d{1,10})$/.exec(externalId);
  if (al) return { al: Number(al[1]) };
  if (/^\d{1,10}$/.test(externalId)) return { mal: Number(externalId) };
  return null;
}

/** Imports bigger than this are not pushed to AniList at all (8.2). */
export const MAX_IMPORT_PUSH_ROWS = 200;

/** Sources whose rows came from AniList: pushing them back would only echo AniList's own data. */
const FROM_ANILIST = new Set(['anilist', 'anilist-sync']);

/**
 * Which committed import rows go to AniList (8.2 push): anime and manga that
 * were added or updated, never rows that came from AniList itself, and
 * nothing at all from an import of more than MAX_IMPORT_PUSH_ROWS rows (it
 * would hold the shared push queue for hours). `importTotal` is the whole
 * import's row count (unknown = treated as large). `skippedLarge` says the
 * import's anime / manga were held back for that reason.
 */
export function importPushTargets(
  rows: { category: string; source: string }[],
  outcomes: { outcome: string; activityId?: string }[],
  importTotal: number | null | undefined,
): { targets: { activityId: string; category: 'ANIME' | 'MANGA' }[]; skippedLarge: boolean } {
  const targets: { activityId: string; category: 'ANIME' | 'MANGA' }[] = [];
  rows.forEach((r, i) => {
    const o = outcomes[i];
    if (!o?.activityId || (o.outcome !== 'added' && o.outcome !== 'updated')) return;
    if (FROM_ANILIST.has(r.source)) return;
    if (r.category === 'anime') targets.push({ activityId: o.activityId, category: 'ANIME' });
    else if (r.category === 'manga') targets.push({ activityId: o.activityId, category: 'MANGA' });
  });
  const large = importTotal == null || !Number.isFinite(importTotal) || importTotal > MAX_IMPORT_PUSH_ROWS;
  if (large) return { targets: [], skippedLarge: targets.length > 0 };
  return { targets, skippedLarge: false };
}

/** AniList user names compare case-insensitively. */
export function sameAniListName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ── OAuth ──────────────────────────────────────────────────────────────────

export const ANILIST_AUTHORIZE_URL = 'https://anilist.co/api/v2/oauth/authorize';
export const ANILIST_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const qs = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', state });
  return `${ANILIST_AUTHORIZE_URL}?${qs}`;
}
