// ───────────────────────────────────────────────────────────────────────────
//  Steam (spec 8.1). What the user types to connect (a profile link, a vanity
//  name or a SteamID64), and the owned-games list → import rows. Pure, so it
//  is tested on fixture JSON; src/lib/apis/steam.ts makes the calls.
//
//  Status: never played (0 min) → Planned, played → Ongoing. Nothing is ever
//  marked done from Steam: playtime says nothing about finishing a game.
// ───────────────────────────────────────────────────────────────────────────

import type { ParseResult } from '../rows';
import type { ImportRow } from '../types';

export type SteamInput = { kind: 'id'; steamId: string } | { kind: 'vanity'; vanity: string };

/** Individual-account SteamID64s start at 76561197960265728 (0x0110000100000000). */
const STEAM_ID64 = /^7656119\d{10}$/;
const VANITY = /^[A-Za-z0-9_-]{2,32}$/;

export function isSteamId64(v: string): boolean {
  return STEAM_ID64.test(v);
}

/**
 * Parse a profile URL (steamcommunity.com/id/<vanity> or /profiles/<id>), a
 * bare SteamID64 or a vanity name. Null for anything else.
 */
export function parseSteamInput(raw: string): SteamInput | null {
  const s = (raw ?? '').trim();
  if (!s || s.length > 300) return null;
  if (isSteamId64(s)) return { kind: 'id', steamId: s };
  const url = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(id|profiles)\/([^/?#\s]+)\/?(?:[?#].*)?$/i.exec(s);
  if (url) {
    const value = decodeURIComponentSafe(url[2]);
    if (url[1].toLowerCase() === 'profiles') return isSteamId64(value) ? { kind: 'id', steamId: value } : null;
    return VANITY.test(value) ? { kind: 'vanity', vanity: value } : null;
  }
  if (/[/.:]/.test(s)) return null; // some other link
  return VANITY.test(s) ? { kind: 'vanity', vanity: s } : null;
}

function decodeURIComponentSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

// ── API shapes ─────────────────────────────────────────────────────────────

/** ISteamUser/ResolveVanityURL/v1: success 1 = found, 42 = no match. */
export interface SteamVanityJson {
  response?: { success?: number; steamid?: string; message?: string } | null;
}

export function steamIdFromVanity(json: SteamVanityJson): string | null {
  const r = json.response;
  return r?.success === 1 && typeof r.steamid === 'string' && isSteamId64(r.steamid) ? r.steamid : null;
}

/** ISteamUser/GetPlayerSummaries/v2. communityvisibilitystate 3 = public. */
export interface SteamSummariesJson {
  response?: { players?: Array<{ steamid?: string; personaname?: string; communityvisibilitystate?: number }> | null } | null;
}

export interface SteamOwnedGame {
  appid?: number;
  name?: string | null;
  /** Minutes, all time. */
  playtime_forever?: number | null;
}

/**
 * IPlayerService/GetOwnedGames/v1. A private profile (or private "game
 * details") answers `{ response: {} }`, without `games`.
 */
export interface SteamOwnedGamesJson {
  response?: { game_count?: number; games?: SteamOwnedGame[] | null } | null;
}

/** The games list, or null when Steam showed none (private game details). */
export function ownedGames(json: SteamOwnedGamesJson): SteamOwnedGame[] | null {
  const games = json.response?.games;
  if (!Array.isArray(games) || games.length === 0) return null;
  return games;
}

export const STEAM_PRIVATE_MESSAGE =
  "Steam didn't show any games for this profile. Set your profile's \"Game details\" to Public in Steam → Edit Profile → Privacy Settings, then try again.";

const minutes = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** One owned game → an import row (null without an app id or name). */
export function mapSteamGame(g: SteamOwnedGame): ImportRow | null {
  const appid = g.appid;
  const title = g.name?.trim();
  if (typeof appid !== 'number' || !Number.isInteger(appid) || appid <= 0 || !title) return null;
  const played = minutes(g.playtime_forever);
  return {
    source: 'steam',
    category: 'games',
    title,
    ids: { steam: String(appid) },
    status: played > 0 ? 'CONSUMING' : 'PLANNED',
    playtimeMinutes: played,
  };
}

/** GetOwnedGames → rows, most played first (one row per app id). */
export function mapSteamOwnedGames(json: SteamOwnedGamesJson): ParseResult {
  const games = ownedGames(json) ?? [];
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const g of games) {
    const row = mapSteamGame(g);
    if (!row) {
      skipped++;
      continue;
    }
    if (seen.has(row.ids.steam!)) continue;
    seen.add(row.ids.steam!);
    rows.push(row);
  }
  rows.sort((a, b) => (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0) || a.title.localeCompare(b.title));
  return { rows, skipped, warnings: [] };
}

/** Playtime by app id, for the nightly refresh. */
export function playtimeByApp(json: SteamOwnedGamesJson): Map<number, number> {
  const out = new Map<number, number>();
  for (const g of ownedGames(json) ?? []) {
    if (typeof g.appid === 'number' && Number.isInteger(g.appid) && g.appid > 0) out.set(g.appid, minutes(g.playtime_forever));
  }
  return out;
}

/** "40 h on Steam" (under an hour: minutes). Null when not played. */
export function formatPlaytime(mins: number | null | undefined): string | null {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return null;
  if (mins < 60) return `${Math.round(mins)} min on Steam`;
  const h = mins / 60;
  return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h on Steam`;
}

/** 10 h: enough play for a game to belong in "Score these" (8.1). */
export const SCORE_PLAYTIME_MINUTES = 600;
