// ───────────────────────────────────────────────────────────────────────────
//  IGDB provider — video games. Requires IGDB_CLIENT_ID + IGDB_CLIENT_SECRET.
//  Uses a Twitch OAuth client-credentials token, cached at module scope and
//  reused until ~60s before expiry. Server-only. fetch { cache: 'no-store' }.
// ───────────────────────────────────────────────────────────────────────────

import type { NormalizedResult } from '@/lib/types';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games';
const IGDB_IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_big';

/** Module-scoped cache for the Twitch app-access token. */
let cachedToken: { token: string; expiresAt: number } | null = null;

interface IgdbCredentials {
  clientId: string;
  clientSecret: string;
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
  const res = await fetch(url, { method: 'POST', cache: 'no-store' });
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
}

export async function searchGames(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];

  const creds = requireCredentials();
  const token = await getAccessToken(creds);

  // Apicalypse plain-text body. Escape any embedded double-quotes in the query.
  const safeQuery = q.replace(/"/g, '\\"');
  const body = `search "${safeQuery}"; fields name,summary,first_release_date,cover.image_id,rating,platforms.name; limit 20;`;

  const res = await fetch(IGDB_GAMES_URL, {
    method: 'POST',
    headers: {
      'Client-ID': creds.clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`IGDB search failed (${res.status})`);

  const games = (await res.json()) as IgdbGame[];

  return games.map((g): NormalizedResult => {
    const image = g.cover?.image_id ? `${IGDB_IMAGE_BASE}/${g.cover.image_id}.jpg` : null;
    const year = g.first_release_date
      ? new Date(g.first_release_date * 1000).getUTCFullYear()
      : null;
    const platforms = (g.platforms ?? [])
      .map((p) => p.name)
      .filter((name): name is string => Boolean(name));
    const igdbRating = g.rating != null ? Math.round(g.rating) : null;

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
      // EXACTLY the VideoGame table columns (+ externalId + title).
      fields: {
        externalId: String(g.id),
        title: g.name,
        imageUrl: image,
        description: g.summary || null,
        year,
        platforms,
        igdbRating,
      },
    };
  });
}
