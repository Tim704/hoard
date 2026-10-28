// The `steam` job (spec 8.1 / F3, 04:30 server time): for every linked Steam
// account, refresh the playtime of the user's games that carry a Steam app id.
// It never changes a status, adds or removes a title. Without STEAM_API_KEY it
// does nothing (spec G4).

import { prisma } from '@/lib/prisma';
import { getOwnedGames, steamConfigured } from '@/lib/apis/steam';
import { linksOf, recordSync } from '@/lib/external-links';
import { ownedGames, playtimeByApp, STEAM_PRIVATE_MESSAGE } from '@/lib/import/sources/steam';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Refresh one user's playtimes. Resolves to how many changed; throws a readable error. */
export async function syncSteamForUser(userId: string, steamId: string): Promise<number> {
  const json = await getOwnedGames(steamId);
  if (!ownedGames(json)) throw new Error(STEAM_PRIVATE_MESSAGE);
  const played = playtimeByApp(json);
  const acts = await prisma.userMediaActivity.findMany({
    where: { userId, category: 'GAME', videoGame: { is: { steamAppId: { in: [...played.keys()] } } } },
    select: { id: true, playtimeMinutes: true, videoGame: { select: { steamAppId: true } } },
  });
  let changed = 0;
  for (const a of acts) {
    const mins = a.videoGame?.steamAppId != null ? played.get(a.videoGame.steamAppId) : undefined;
    if (mins === undefined || mins === a.playtimeMinutes) continue;
    // Raw SQL on purpose: playtime isn't the user's edit, so `updatedAt` (the
    // "recently touched" order, the AniList conflict rule) stays as it is.
    await prisma.$executeRaw`UPDATE "UserMediaActivity" SET "playtimeMinutes" = ${mins} WHERE id = ${a.id}`;
    changed++;
  }
  return changed;
}

export async function runSteam(): Promise<{ users: number; changed: number; failed: number }> {
  const tally = { users: 0, changed: 0, failed: 0 };
  if (!steamConfigured()) return tally;
  for (const link of await linksOf('steam')) {
    tally.users++;
    try {
      tally.changed += await syncSteamForUser(link.userId, link.accountId);
      await recordSync(link.userId, 'steam', null);
    } catch (err) {
      tally.failed++;
      await recordSync(link.userId, 'steam', err instanceof Error ? err.message : 'Steam sync failed.').catch(() => {});
    }
    await sleep(1000);
  }
  return tally;
}
