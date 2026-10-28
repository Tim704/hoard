// ───────────────────────────────────────────────────────────────────────────
//  Steam Web API (spec 8.1). Requires STEAM_API_KEY. Server-only: the key is
//  read here and never leaves the server. Every call goes through
//  providerFetch (no-store, 8 s timeout); the JSON mapping is pure, in
//  src/lib/import/sources/steam.ts.
// ───────────────────────────────────────────────────────────────────────────

import {
  isSteamId64,
  steamIdFromVanity,
  type SteamOwnedGamesJson,
  type SteamSummariesJson,
  type SteamVanityJson,
} from '@/lib/import/sources/steam';

import { providerFetch } from './http';

const STEAM_API = 'https://api.steampowered.com';

export const STEAM_NOT_CONFIGURED =
  "Steam isn't configured on this server. Ask the owner to add a Steam Web API key (STEAM_API_KEY).";

export function steamConfigured(): boolean {
  return Boolean(process.env.STEAM_API_KEY);
}

function requireKey(): string {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new Error(STEAM_NOT_CONFIGURED);
  return key;
}

async function steamGet<T>(path: string, params: Record<string, string>, what: string): Promise<T> {
  const qs = new URLSearchParams({ key: requireKey(), format: 'json', ...params });
  const res = await providerFetch(`${STEAM_API}${path}?${qs}`, { headers: { Accept: 'application/json' } }).catch(() => null);
  if (!res) throw new Error(`Steam did not answer in time (${what}). Try again later.`);
  if (res.status === 401 || res.status === 403) throw new Error('Steam refused the API key. Ask the owner to check STEAM_API_KEY.');
  if (!res.ok) throw new Error(`Steam ${what} failed (${res.status}). Try again later.`);
  const json = (await res.json().catch(() => null)) as T | null;
  if (!json) throw new Error(`Steam sent something unexpected (${what}).`);
  return json;
}

/** A vanity name → SteamID64, or null when Steam knows no such profile. */
export async function resolveVanity(vanity: string): Promise<string | null> {
  const json = await steamGet<SteamVanityJson>('/ISteamUser/ResolveVanityURL/v1/', { vanityurl: vanity }, 'profile lookup');
  return steamIdFromVanity(json);
}

/** The profile's display name and whether it is public, or null when it doesn't exist. */
export async function playerSummary(steamId: string): Promise<{ name: string; isPublic: boolean } | null> {
  if (!isSteamId64(steamId)) return null;
  const json = await steamGet<SteamSummariesJson>('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }, 'profile lookup');
  const p = json.response?.players?.find((x) => x.steamid === steamId);
  if (!p) return null;
  return { name: p.personaname?.trim() || steamId, isPublic: p.communityvisibilitystate === 3 };
}

/** Every owned game, with names and playtime (free games played included). */
export async function getOwnedGames(steamId: string): Promise<SteamOwnedGamesJson> {
  if (!isSteamId64(steamId)) throw new Error('That is not a Steam account.');
  return steamGet<SteamOwnedGamesJson>(
    '/IPlayerService/GetOwnedGames/v1/',
    { steamid: steamId, include_appinfo: '1', include_played_free_games: '1' },
    'games list',
  );
}
