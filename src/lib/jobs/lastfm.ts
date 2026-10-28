// The `lastfm` job (spec 8.3 / F3, 05:00 server time): for each linked
// Last.fm account, check its Planned and Ongoing albums' play counts
// (album.getInfo&username=). An album played to 80 % of its tracks gets a
// "Mark as Listened?" suggestion (stored on the link) and one notification.
// It never changes a status. At most LASTFM_NIGHTLY_LIMIT albums a night in
// all, paced; each link keeps a cursor so the next night carries on where
// this one stopped. Without LASTFM_API_KEY it does nothing (spec G4).

import { prisma } from '@/lib/prisma';
import { fetchAlbumUserPlays, lastfmConfigured } from '@/lib/apis/music';
import { linkData, linksOf, patchLinkData, recordSync } from '@/lib/external-links';
import {
  LASTFM_GAP_MS,
  LASTFM_NIGHTLY_LIMIT,
  suggestedIds,
  suggestsListened,
  withSuggested,
} from '@/lib/lastfm-suggest';
import { notify } from '@/lib/notify';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Check up to `budget` of one user's albums. Resolves to the number checked
 * and the new suggestions. Throws only when Last.fm itself fails.
 */
export async function checkLastfmForUser(
  userId: string,
  username: string,
  budget: number,
  data: Record<string, unknown>,
): Promise<{ checked: number; suggested: number }> {
  const skip = new Set([...suggestedIds(data), ...suggestedIds({ suggested: data.dismissed })]);
  const cursor = typeof data.cursor === 'string' ? data.cursor : null;
  const where = {
    userId,
    category: 'MUSIC' as const,
    status: { in: ['PLANNED', 'CONSUMING'] as ('PLANNED' | 'CONSUMING')[] },
    musicAlbum: { is: { artist: { not: null } } },
  };
  const select = { id: true, musicAlbum: { select: { title: true, artist: true, trackCount: true } } };
  // After the cursor first, then from the start (wrapping round).
  let acts = await prisma.userMediaActivity.findMany({
    where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) },
    select,
    orderBy: { id: 'asc' },
    take: budget,
  });
  if (cursor && acts.length < budget) {
    const more = await prisma.userMediaActivity.findMany({
      where: { ...where, id: { lte: cursor } },
      select,
      orderBy: { id: 'asc' },
      take: budget - acts.length,
    });
    acts = [...acts, ...more];
  }

  const found: { id: string; title: string }[] = [];
  let checked = 0;
  let last: string | null = null;
  for (const a of acts) {
    const album = a.musicAlbum;
    last = a.id;
    if (!album?.artist || skip.has(a.id)) continue;
    if (checked > 0) await sleep(LASTFM_GAP_MS);
    checked++;
    const plays = await fetchAlbumUserPlays(album.artist, album.title, username);
    if (plays && suggestsListened(plays.userPlays, plays.trackCount ?? album.trackCount)) {
      found.push({ id: a.id, title: album.title });
    }
  }

  await patchLinkData(userId, 'lastfm', (d) => ({ ...withSuggested(d, found.map((f) => f.id)), cursor: last }));
  for (const f of found) {
    await notify(userId, {
      kind: 'lastfm',
      title: `Listened to ${f.title}?`,
      body: `Last.fm says you've played most of ${f.title}. Mark it as listened in Music.`,
      url: '/music',
      dedupeKey: `lastfm-listened:${f.id}`,
    });
  }
  return { checked, suggested: found.length };
}

export async function runLastfm(): Promise<{ users: number; checked: number; suggested: number; failed: number }> {
  const tally = { users: 0, checked: 0, suggested: 0, failed: 0 };
  if (!lastfmConfigured()) return tally;
  for (const link of await linksOf('lastfm')) {
    const budget = LASTFM_NIGHTLY_LIMIT - tally.checked;
    if (budget <= 0) break;
    tally.users++;
    try {
      const res = await checkLastfmForUser(link.userId, link.accountId, budget, linkData(link));
      tally.checked += res.checked;
      tally.suggested += res.suggested;
      await recordSync(link.userId, 'lastfm', null);
    } catch (err) {
      tally.failed++;
      await recordSync(link.userId, 'lastfm', err instanceof Error ? err.message : 'Last.fm check failed.').catch(() => {});
    }
  }
  return tally;
}
