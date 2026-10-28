// ───────────────────────────────────────────────────────────────────────────
//  IGDB provider — video games. Requires IGDB_CLIENT_ID + IGDB_CLIENT_SECRET.
//  Uses a Twitch OAuth client-credentials token, cached at module scope and
//  reused until ~60s before expiry. Server-only. fetch { cache: 'no-store' }.
// ───────────────────────────────────────────────────────────────────────────

import { normalizeGenres } from '@/lib/genres';
import type { NormalizedResult } from '@/lib/types';

import { providerFetch } from './http';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games';
const IGDB_TTB_URL = 'https://api.igdb.com/v4/game_time_to_beats';
const IGDB_IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_big';

/** Module-scoped cache for the Twitch app-access token. */
let cachedToken: { token: string; expiresAt: number } | null = null;

interface IgdbCredentials {
  clientId: string;
  clientSecret: string;
}

export function igdbConfigured(): boolean {
  return Boolean(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET);
}

/** Read & validate IGDB credentials, throwing a hard error when absent. */
function requireCredentials(): IgdbCredentials {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('IGDB credentials not configured (IGDB_CLIENT_ID / IGDB_CLIENT_SECRET)');
  }
  return { clientId, clientSecret };
}

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
}

/** Fetch (or reuse a cached) Twitch client-credentials access token. */
async function getAccessToken(creds: IgdbCredentials): Promise<string> {
  const now = Date.now();
  // Reuse the cached token until ~60s before it expires.
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token;
  }

  const url =
    `${TWITCH_TOKEN_URL}?client_id=${encodeURIComponent(creds.clientId)}` +
    `&client_secret=${encodeURIComponent(creds.clientSecret)}` +
    `&grant_type=client_credentials`;
  const res = await providerFetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Twitch OAuth token request failed (${res.status})`);

  const data = (await res.json()) as TwitchTokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cachedToken.token;
}

interface IgdbGame {
  id: number;
  name: string;
  summary?: string | null;
  first_release_date?: number | null;
  cover?: { image_id?: string | null } | null;
  rating?: number | null;
  platforms?: Array<{ name?: string | null }> | null;
  genres?: Array<{ name?: string | null }> | null;
}

/**
 * The franchise (or, failing that, the collection/series) an IGDB game belongs
 * to, for franchise grouping. Returns null when IGDB lists neither.
 */
export async function fetchGameFranchise(
  externalId: string,
): Promise<{ key: string; name: string } | null> {
  const creds = requireCredentials();
  const token = await getAccessToken(creds);
  const id = Number(externalId);
  if (!Number.isFinite(id)) return null;

  const res = await providerFetch(IGDB_GAMES_URL, {
    method: 'POST',
    headers: {
      'Client-ID': creds.clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: `where id = ${id}; fields franchises.name,collections.name; limit 1;`,
  });
  if (!res.ok) throw new Error(`IGDB franchise lookup failed (${res.status})`);

  const [game] = (await res.json()) as Array<{
    franchises?: Array<{ id: number; name?: string }> | null;
    collections?: Array<{ id: number; name?: string }> | null;
  }>;
  const fr = game?.franchises?.find((f) => f.name);
  if (fr?.name) return { key: `igdb-fr:${fr.id}`, name: fr.name };
  const col = game?.collections?.find((c) => c.name);
  if (col?.name) return { key: `igdb-col:${col.id}`, name: col.name };
  return null;
}

export async function searchGames(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];

  const creds = requireCredentials();
  const token = await getAccessToken(creds);

  // Apicalypse plain-text body. Escape any embedded double-quotes in the query.
  const safeQuery = q.replace(/"/g, '\\"');
  const body = `search "${safeQuery}"; fields name,summary,first_release_date,cover.image_id,rating,platforms.name,genres.name; limit 20;`;

  const res = await providerFetch(IGDB_GAMES_URL, {
    method: 'POST',
    headers: {
      'Client-ID': creds.clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error(`IGDB search failed (${res.status})`);

  const games = (await res.json()) as IgdbGame[];

  return games.map(mapGameSearchHit);
}

/** A unix-seconds IGDB date → YYYY-MM-DD (UTC, as IGDB stores them). */
function ymdFromUnix(seconds: number | null | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** One IGDB search hit → a NormalizedResult (fields = VideoGame columns). */
export function mapGameSearchHit(g: IgdbGame): NormalizedResult {
  const image = g.cover?.image_id ? `${IGDB_IMAGE_BASE}/${g.cover.image_id}.jpg` : null;
  const year = g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null;
  const platforms = (g.platforms ?? [])
    .map((p) => p.name)
    .filter((name): name is string => Boolean(name));
  const igdbRating = g.rating != null ? Math.round(g.rating) : null;
  const releaseDate = ymdFromUnix(g.first_release_date);
  const genres = normalizeGenres((g.genres ?? []).map((x) => x.name));

  const subtitleParts: string[] = [];
  if (year) subtitleParts.push(String(year));
  if (platforms.length) subtitleParts.push(platforms.slice(0, 3).join(', '));

  return {
    externalId: String(g.id),
    title: g.name,
    imageUrl: image,
    subtitle: subtitleParts.length ? subtitleParts.join(' · ') : null,
    year,
    description: g.summary || null,
    // EXACTLY the VideoGame table columns (+ externalId + title). F2 columns
    // are only sent when known, so re-adding never blanks stored details.
    fields: {
      externalId: String(g.id),
      title: g.name,
      imageUrl: image,
      description: g.summary || null,
      year,
      platforms,
      igdbRating,
      ...(releaseDate && { releaseDate }),
      ...(genres.length && { genres }),
    },
  };
}

/**
 * An `external_games` entry, expanded with its source. IGDB deprecated the
 * `category` enum (Steam = 1) in favour of `external_game_source`, a reference
 * to /external_game_sources ({ id, name }); we ask for the source's name and
 * also accept the store URL as a fallback.
 */
export interface IgdbExternalGame {
  uid?: string | null;
  url?: string | null;
  external_game_source?: number | { id?: number; name?: string | null } | null;
}

const STEAM_URL = /store\.steampowered\.com\/app\/(\d+)/i;
/** /external_game_sources id of Steam (same value as the old category enum). */
const STEAM_SOURCE_ID = 1;

function isSteam(e: IgdbExternalGame): boolean {
  const src = e.external_game_source;
  if (typeof src === 'number') return src === STEAM_SOURCE_ID;
  if (src && typeof src === 'object') {
    if (typeof src.name === 'string') return src.name.trim().toLowerCase() === 'steam';
    return src.id === STEAM_SOURCE_ID;
  }
  return false;
}

/** The Steam app id among a game's external ids, or null. */
export function steamAppIdFrom(external: IgdbExternalGame[] | null | undefined): number | null {
  for (const e of external ?? []) {
    const fromUrl = e.url ? STEAM_URL.exec(e.url)?.[1] : undefined;
    const raw = isSteam(e) ? (e.uid ?? fromUrl) : fromUrl;
    const id = Number(raw);
    if (raw && Number.isInteger(id) && id > 0) return id;
  }
  return null;
}

/** IGDB `normally` (seconds) → hours, one decimal; null when unknown. */
export function timeToBeatHours(ttb: { normally?: number | null } | null | undefined): number | null {
  const s = ttb?.normally;
  if (!s || !Number.isFinite(s) || s <= 0) return null;
  return Math.round(s / 360) / 10;
}

export interface IgdbGameDetailsJson {
  name?: string | null;
  summary?: string | null;
  cover?: { image_id?: string | null } | null;
  rating?: number | null;
  first_release_date?: number | null;
  genres?: Array<{ name?: string | null }> | null;
  external_games?: IgdbExternalGame[] | null;
}

export interface GameDetails {
  // The display core (the provider is the source of truth for these).
  title: string | null;
  imageUrl: string | null;
  description: string | null;
  igdbRating: number | null;
  releaseDate: string | null;
  year: number | null;
  genres: string[];
  steamAppId: number | null;
  timeToBeatHours: number | null;
}

/** POST /games + POST /game_time_to_beats → our game details. */
export function mapGameDetails(
  game: IgdbGameDetailsJson,
  ttb: { normally?: number | null } | null | undefined,
): GameDetails {
  return {
    title: game.name?.trim() || null,
    imageUrl: game.cover?.image_id ? `${IGDB_IMAGE_BASE}/${game.cover.image_id}.jpg` : null,
    description: game.summary?.trim() || null,
    igdbRating: game.rating != null && Number.isFinite(game.rating) ? Math.round(game.rating) : null,
    releaseDate: ymdFromUnix(game.first_release_date),
    year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
    genres: normalizeGenres((game.genres ?? []).map((g) => g.name)),
    steamAppId: steamAppIdFrom(game.external_games),
    timeToBeatHours: timeToBeatHours(ttb),
  };
}

/**
 * Fetch a game's details: release date, genres, Steam app id (from its
 * external ids) and time to beat (from /game_time_to_beats). Null when IGDB
 * doesn't know the id. Throws on request failures.
 */
export async function fetchGameDetails(externalId: string): Promise<GameDetails | null> {
  const creds = requireCredentials();
  const token = await getAccessToken(creds);
  const id = Number(externalId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const post = (url: string, body: string) =>
    providerFetch(url, {
      method: 'POST',
      headers: {
        'Client-ID': creds.clientId,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body,
    });

  const gameRes = await post(
    IGDB_GAMES_URL,
    `where id = ${id}; fields name,summary,cover.image_id,rating,first_release_date,genres.name,external_games.uid,external_games.url,external_games.external_game_source.name; limit 1;`,
  );
  if (!gameRes.ok) throw new Error(`IGDB game details failed (${gameRes.status})`);
  const [game] = (await gameRes.json()) as IgdbGameDetailsJson[];
  if (!game) return null;

  // No time-to-beat entry (an empty list) is a real answer. A failed request
  // (429, 5xx, timeout) throws instead, so the row isn't stamped as done and
  // is retried later rather than going 30 days without its time to beat.
  const ttbRes = await post(IGDB_TTB_URL, `where game_id = ${id}; fields normally; limit 1;`);
  if (!ttbRes.ok) throw new Error(`IGDB time to beat failed (${ttbRes.status})`);
  const [ttb] = (await ttbRes.json()) as Array<{ normally?: number | null }>;
  return mapGameDetails(game, ttb);
}

/**
 * The Apicalypse body listing the games of a franchise key from
 * resolveFranchise ("igdb-fr:12" → franchises, "igdb-col:34" → collections),
 * main entries only: no editions (`version_parent`) and no DLC or expansions
 * (`parent_game`). Null for any other key.
 */
export function franchiseGamesQuery(key: string): string | null {
  const m = /^igdb-(fr|col):(\d{1,12})$/.exec(key);
  if (!m) return null;
  const field = m[1] === 'fr' ? 'franchises' : 'collections';
  return (
    `fields name,summary,first_release_date,cover.image_id,rating,platforms.name,genres.name; ` +
    `where ${field} = (${m[2]}) & version_parent = null & parent_game = null; ` +
    `sort first_release_date asc; limit 100;`
  );
}

/** The games of an IGDB franchise or collection (2.10). Throws on failures and without keys. */
export async function fetchFranchiseGames(key: string): Promise<NormalizedResult[]> {
  const body = franchiseGamesQuery(key);
  if (!body) return [];
  const creds = requireCredentials();
  const token = await getAccessToken(creds);
  const res = await providerFetch(IGDB_GAMES_URL, {
    method: 'POST',
    headers: { 'Client-ID': creds.clientId, Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`IGDB franchise games failed (${res.status})`);
  return ((await res.json()) as IgdbGame[]).map(mapGameSearchHit);
}

const IGDB_EXTERNAL_GAMES_URL = 'https://api.igdb.com/v4/external_games';
const GAME_HIT_FIELDS = 'name,summary,first_release_date,cover.image_id,rating,platforms.name,genres.name';

/** POST an Apicalypse body to an IGDB endpoint (credentials + token). */
async function igdbPost<T>(url: string, body: string, what: string): Promise<T[]> {
  const creds = requireCredentials();
  const token = await getAccessToken(creds);
  const res = await providerFetch(url, {
    method: 'POST',
    headers: { 'Client-ID': creds.clientId, Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`IGDB ${what} failed (${res.status})`);
  return (await res.json()) as T[];
}

/** The Apicalypse body for one game by its igdb.com slug (null for a bad slug). */
export function gameBySlugQuery(slug: string): string | null {
  if (!/^[a-z0-9-]{1,200}$/.test(slug)) return null;
  return `where slug = "${slug}"; fields ${GAME_HIT_FIELDS}; limit 1;`;
}

/** The Apicalypse body for the IGDB game behind a Steam app id. */
export function steamExternalQuery(appId: string): string | null {
  if (!/^\d{1,10}$/.test(appId)) return null;
  return `where uid = "${appId}" & external_game_source = ${STEAM_SOURCE_ID}; fields game; limit 1;`;
}

/** A game by its igdb.com URL slug (add by link, 2.4), or null. */
export async function fetchGameBySlug(slug: string): Promise<NormalizedResult | null> {
  const body = gameBySlugQuery(slug);
  if (!body) return null;
  const [game] = await igdbPost<IgdbGame>(IGDB_GAMES_URL, body, 'game lookup');
  return game?.id ? mapGameSearchHit(game) : null;
}

/**
 * The game behind a Steam store link, through IGDB's external games (the
 * same Steam `external_game_source` the metadata job reads), or null.
 */
export async function fetchGameBySteamAppId(appId: string): Promise<NormalizedResult | null> {
  const body = steamExternalQuery(appId);
  if (!body) return null;
  const [ext] = await igdbPost<{ game?: number | null }>(IGDB_EXTERNAL_GAMES_URL, body, 'Steam lookup');
  const id = ext?.game;
  if (typeof id !== 'number' || !Number.isInteger(id)) return null;
  const [game] = await igdbPost<IgdbGame>(IGDB_GAMES_URL, `where id = ${id}; fields ${GAME_HIT_FIELDS}; limit 1;`, 'game lookup');
  return game?.id ? mapGameSearchHit(game) : null;
}
