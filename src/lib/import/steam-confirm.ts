// ───────────────────────────────────────────────────────────────────────────
//  Confirming a Steam app id before it lands on the shared catalogue (8.1).
//  `VideoGame.steamAppId` is shared by every user and drives the nightly
//  playtime refresh, so a value sent back by a browser is never trusted: it
//  is written only when IGDB's external games map that app id to the very
//  same IGDB game. Mappings IGDB already answered during matching are kept
//  in a bounded in-process cache, so a normal import costs no extra calls.
//  Pure apart from the injected lookup.
// ───────────────────────────────────────────────────────────────────────────

import { LruMap } from '@/lib/lru';

/** Steam app id → IGDB game id (as the VideoGame externalId string). */
export type SteamMappingCache = LruMap<number, string | null>;

const g = globalThis as unknown as { __hoardSteamMappings?: SteamMappingCache };
export const steamMappings: SteamMappingCache = g.__hoardSteamMappings ?? (g.__hoardSteamMappings = new LruMap(5000));

/** Remember mappings IGDB (or the confirmed catalogue) gave for app ids. */
export function rememberSteamMappings(found: Map<number, { externalId: string }>, cache: SteamMappingCache = steamMappings): void {
  for (const [app, hit] of found) if (/^\d+$/.test(hit.externalId)) cache.set(app, hit.externalId);
}

/**
 * True when IGDB says `appId` is the Steam release of the IGDB game
 * `igdbId`. Hand-made or non-IGDB ids never confirm. `lookup` failures
 * propagate (the caller then simply doesn't write).
 */
export async function confirmSteamApp(
  appId: number,
  igdbId: string,
  lookup: (appId: number) => Promise<string | null>,
  cache: SteamMappingCache = steamMappings,
): Promise<boolean> {
  if (!Number.isInteger(appId) || appId <= 0 || !/^\d{1,12}$/.test(igdbId)) return false;
  let mapped = cache.get(appId);
  if (mapped === undefined) {
    mapped = await lookup(appId);
    cache.set(appId, mapped);
  }
  return mapped === igdbId;
}
