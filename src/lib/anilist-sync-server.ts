// ───────────────────────────────────────────────────────────────────────────
//  AniList sync (spec 8.2), the server half. Not a server action: callers
//  authenticate (or are the nightly job).
//
//  Pull: re-read the user's public lists (prefs.anilistUser) and apply them in
//  "update existing" mode through the import commit, matched by MAL / AniList
//  id with no review: only sure (id) matches are written, nothing is removed,
//  and src/lib/anilist-sync.ts decides what changes (most recent change wins).
//  Every write records an `import` event with meta.source 'anilist-sync'.
//
//  Push: only with ANILIST_CLIENT_ID / ANILIST_CLIENT_SECRET and HOARD_SECRET,
//  and once the user connected through OAuth. After a local status / score /
//  progress change on an anime or manga commits, `queueAniListPush` sends it
//  through SaveMediaListEntry: best effort, one at a time in-process; a failure
//  is recorded on the link and notified once a day.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { anilistGraphql } from '@/lib/apis/anilist';
import {
  aniListIdFromKey,
  pulledEntries,
  pushVariables,
  resolveConflict,
  SAVE_ENTRY_MUTATION,
  type PulledEntry,
} from '@/lib/anilist-sync';
import { getLink, recordSync } from '@/lib/external-links';
import { readAniListLists } from '@/lib/import/anilist-fetch';
import { matchRows } from '@/lib/import/matcher';
import { commitRow, serverMatchDeps } from '@/lib/import/server';
import { MATCH_CHUNK, type CommitRow } from '@/lib/import/types';
import { getPrefs } from '@/lib/data-prefs';
import { LruMap } from '@/lib/lru';
import { notify } from '@/lib/notify';
import { userToday } from '@/lib/library/seen-seasons';
import { openToken, secretConfigured } from '@/lib/secret-box';
import type { Status } from '@/lib/status';
import { UserError } from '@/lib/action-error';
import { isDiaryStatus } from '@/lib/diary';

export const ANILIST_SYNC_ERROR_PREFIX = 'AniList';

/** OAuth push is possible on this server (keys + HOARD_SECRET). */
export function aniListPushConfigured(): boolean {
  return Boolean(process.env.ANILIST_CLIENT_ID && process.env.ANILIST_CLIENT_SECRET && secretConfigured());
}

// ── Pull ───────────────────────────────────────────────────────────────────

export interface PullTally {
  added: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** Entries without a sure (id) match: not written, since there is no review. */
  skipped: number;
}

/** Pull one user's AniList lists into Hoard. Throws a readable error when the lists can't be read. */
export async function pullAniListForUser(userId: string, username: string): Promise<PullTally> {
  const read = await readAniListLists(username);
  if (!read.ok) throw new UserError(read.error);
  const entries: PulledEntry[] = [
    ...pulledEntries(read.lists.ANIME, 'ANIME'),
    ...pulledEntries(read.lists.MANGA, 'MANGA'),
  ];
  const tally: PullTally = { added: 0, updated: 0, unchanged: 0, failed: 0, skipped: 0 };
  const deps = serverMatchDeps(userId);

  for (let i = 0; i < entries.length; i += MATCH_CHUNK) {
    const part = entries.slice(i, i + MATCH_CHUNK);
    const matches = await matchRows(
      part.map((e) => e.row),
      deps,
    );
    const owned = matches.map((m) => m.inLibrary?.activityId).filter((id): id is string => Boolean(id));
    const locals = new Map(
      (
        await prisma.userMediaActivity.findMany({
          where: { id: { in: owned }, userId },
          select: { id: true, status: true, rating: true, progress: true, updatedAt: true },
        })
      ).map((a) => [a.id, a]),
    );

    for (let j = 0; j < part.length; j++) {
      const { row, updatedAt } = part[j];
      const m = matches[j];
      // No review: only id matches are sure enough to write.
      const result = m.chosenIndex >= 0 && m.confidence === 'high' ? m.candidates[m.chosenIndex] : null;
      if (!result) {
        tally.skipped++;
        continue;
      }
      const local = m.inLibrary ? locals.get(m.inLibrary.activityId) : undefined;
      let commit: CommitRow;
      if (local) {
        const change = resolveConflict(
          { status: local.status as Status, rating: local.rating, progress: local.progress, updatedAt: local.updatedAt },
          row,
          updatedAt,
        );
        if (Object.keys(change).length === 0) {
          tally.unchanged++;
          continue;
        }
        // Only what changes: the commit's update leaves everything else alone.
        commit = {
          category: row.category,
          source: 'anilist-sync',
          result,
          status: change.status ?? (local.status as Status),
          ...(change.rating !== undefined && { rating: change.rating }),
          ...(change.progress !== undefined && { progress: change.progress }),
          // Finishing here: AniList's completion day dates finishedAt (when
          // unset) and the diary entry (final review 13).
          ...(change.status !== undefined && isDiaryStatus(change.status) && row.finishedOn && { finishedOn: row.finishedOn }),
        };
      } else {
        commit = {
          category: row.category,
          source: 'anilist-sync',
          result,
          status: row.status,
          rating: row.rating ?? null,
          ...(row.progress != null && { progress: row.progress }),
          ...(row.startedOn && { startedOn: row.startedOn }),
          ...(row.finishedOn && { finishedOn: row.finishedOn }),
          ...(row.rewatchCount != null && { rewatchCount: row.rewatchCount }),
          ...(row.notes && { notes: row.notes }),
        };
      }
      const outcome = await commitRow(userId, commit, { updateExisting: true });
      if (outcome.outcome === 'added') tally.added++;
      else if (outcome.outcome === 'updated') tally.updated++;
      else if (outcome.outcome === 'failed') tally.failed++;
      else tally.unchanged++;
    }
  }
  return tally;
}

/** The nightly `anilist-sync` job: every user with an AniList username. */
export async function runAniListSync(): Promise<{ users: number; failed: number }> {
  const users = await prisma.user.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  const tally = { users: 0, failed: 0 };
  for (const { id } of users) {
    const prefs = await getPrefs(id);
    if (!prefs.anilistUser) continue;
    tally.users++;
    try {
      await pullAniListForUser(id, prefs.anilistUser);
      await recordSync(id, 'anilist', null);
    } catch (err) {
      tally.failed++;
      const message = err instanceof Error ? err.message : 'AniList sync failed.';
      await recordSync(id, 'anilist', message).catch(() => {});
      await syncErrorNotice(id, `The nightly AniList sync failed: ${message}`);
    }
  }
  return tally;
}

/** One "sync error" notification per user and day. */
async function syncErrorNotice(userId: string, body: string): Promise<void> {
  const day = await userToday(userId).catch(() => new Date().toISOString().slice(0, 10));
  await notify(userId, {
    kind: 'sync',
    title: 'AniList sync problem',
    body,
    url: '/settings#accounts',
    dedupeKey: `anilist-sync-error:${day}`,
  });
}

// ── Push ───────────────────────────────────────────────────────────────────

/** MAL id → AniList id, bounded (one lookup per title, ever). */
const malToAniList = new LruMap<string, number>(5000);

async function aniListMediaId(externalId: string, type: 'ANIME' | 'MANGA'): Promise<number | null> {
  const key = aniListIdFromKey(externalId);
  if (!key) return null;
  if ('al' in key) return key.al;
  const cacheKey = `${type}:${key.mal}`;
  const cached = malToAniList.get(cacheKey);
  if (cached) return cached;
  const answer = await anilistGraphql<{ Media: { id: number } | null }>(
    'query ($idMal: Int, $type: MediaType) { Media(idMal: $idMal, type: $type) { id } }',
    { idMal: key.mal, type },
    'AniList id lookup',
  );
  const id = answer.data?.Media?.id ?? null;
  if (id) malToAniList.set(cacheKey, id);
  return id;
}

/** Send one activity's current state to AniList. Throws a readable error. */
async function pushNow(userId: string, activityId: string): Promise<void> {
  const link = await getLink(userId, 'anilist');
  if (!link?.token) return;
  const token = openToken(link.token);
  if (!token) throw new UserError('The saved AniList connection can no longer be read. Connect AniList again in Settings.');
  const a = await prisma.userMediaActivity.findUnique({
    where: { id: activityId },
    select: {
      userId: true,
      category: true,
      status: true,
      rating: true,
      progress: true,
      rewatching: true,
      anime: { select: { externalId: true, title: true } },
      manga: { select: { externalId: true, title: true } },
    },
  });
  if (!a || a.userId !== userId) return;
  const media = a.category === 'ANIME' ? a.anime : a.category === 'MANGA' ? a.manga : null;
  if (!media) return;
  const mediaId = await aniListMediaId(media.externalId, a.category === 'ANIME' ? 'ANIME' : 'MANGA');
  if (!mediaId) return; // a hand-made entry: nothing on AniList to update
  const answer = await anilistGraphql<{ SaveMediaListEntry: { id: number } | null }>(
    SAVE_ENTRY_MUTATION,
    { ...pushVariables(mediaId, { ...a, status: a.status as Status }) },
    'AniList save',
    token,
  );
  const err = answer.errors[0];
  if (err) {
    if (err.status === 401 || /invalid token|unauthori[sz]ed/i.test(err.message ?? '')) {
      throw new UserError('AniList no longer accepts the connection. Connect AniList again in Settings.');
    }
    throw new UserError(`AniList didn't save "${media.title}": ${err.message ?? 'unknown error'}`);
  }
}

let queue: Promise<void> = Promise.resolve();

/**
 * Queue a push of an anime / manga activity's status, score and progress.
 * Returns at once; never throws. Call it after the local change committed.
 */
export function queueAniListPush(userId: string, activityId: string, category: string): void {
  if (category !== 'ANIME' && category !== 'MANGA') return;
  if (!aniListPushConfigured()) return;
  queue = queue
    .then(async () => {
      try {
        await pushNow(userId, activityId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AniList push failed.';
        await recordSync(userId, 'anilist', message).catch(() => {});
        await syncErrorNotice(userId, message);
      }
    })
    .catch(() => {});
}
