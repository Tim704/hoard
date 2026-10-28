// ───────────────────────────────────────────────────────────────────────────
//  Last.fm provider — music albums. Requires LASTFM_API_KEY.
//  Server-only. Every call goes through providerFetch (no-store, 8 s timeout).
//  Genres (spec F2) are the album's top 3 usable tags from album.getInfo.
// ───────────────────────────────────────────────────────────────────────────

import { genresFromTags } from '@/lib/genres';
import type { NormalizedResult } from '@/lib/types';

import { providerFetch } from './http';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

export function lastfmConfigured(): boolean {
  return Boolean(process.env.LASTFM_API_KEY);
}

/** Read & validate the API key, throwing a hard error when absent. */
function requireKey(): string {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error('LASTFM_API_KEY not configured');
  return key;
}

interface LastfmImage {
  size?: string;
  '#text'?: string;
}

interface LastfmAlbum {
  name: string;
  artist?: string | null;
  mbid?: string | null;
  image?: LastfmImage[] | null;
}

interface LastfmResponse {
  results?: {
    albummatches?: {
      album?: LastfmAlbum[];
    };
  };
}

/** Pick the 'extralarge' cover (or fall back to the last) image URL; null if blank. */
function pickImage(images: LastfmImage[] | null | undefined): string | null {
  if (!images || images.length === 0) return null;
  const extralarge = images.find((img) => img.size === 'extralarge');
  const chosen = extralarge ?? images[images.length - 1];
  const text = chosen?.['#text'];
  return text ? text : null;
}

export async function searchAlbums(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];

  const key = requireKey();
  const url =
    `${LASTFM_BASE}?method=album.search&album=${encodeURIComponent(q)}` +
    `&api_key=${key}&format=json&limit=20`;
  const res = await providerFetch(url);
  if (!res.ok) throw new Error(`Last.fm album search failed (${res.status})`);

  const json = (await res.json()) as LastfmResponse;
  const albums = json.results?.albummatches?.album ?? [];

  return albums.map((a): NormalizedResult => {
    const image = pickImage(a.image);
    const artist = a.artist || null;
    const externalId = a.mbid && a.mbid.length ? a.mbid : `${a.artist}::${a.name}`;

    return {
      externalId,
      title: a.name,
      imageUrl: image,
      subtitle: artist,
      year: null,
      description: null,
      // EXACTLY the MusicAlbum table columns (+ externalId + title).
      fields: {
        externalId,
        title: a.name,
        imageUrl: image,
        description: null,
        year: null,
        artist,
        trackCount: null,
      },
    };
  });
}

/** Last.fm returns a single object instead of a one-element array, and "" for none. */
function asArray<T>(v: T | T[] | '' | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export interface LastfmAlbumInfoJson {
  error?: number;
  message?: string;
  album?: {
    tags?: { tag?: { name?: string } | Array<{ name?: string }> } | '' | null;
    tracks?: { track?: unknown | unknown[] } | '' | null;
  } | null;
}

export interface AlbumDetails {
  genres: string[];
  trackCount: number | null;
}

/** Last.fm error code for an unknown artist / album ("Album not found"). */
const LASTFM_NOT_FOUND = 6;

/**
 * album.getInfo JSON → genres (top 3 tags) and the track count. Null only when
 * Last.fm says the album doesn't exist (error 6); any other API error (rate
 * limit 29, service down 11/16, bad key 10, …) throws so the row is retried.
 */
export function mapAlbumInfo(json: LastfmAlbumInfoJson): AlbumDetails | null {
  if (json.error === LASTFM_NOT_FOUND) return null;
  if (json.error) throw new Error(`Last.fm album info failed (error ${json.error}: ${json.message ?? 'unknown'})`);
  if (!json.album) return null;
  const tags = json.album.tags ? asArray(json.album.tags.tag) : [];
  const tracks = json.album.tracks ? asArray(json.album.tracks.track) : [];
  return { genres: genresFromTags(tags), trackCount: tracks.length || null };
}

/**
 * Fetch an album's tags (and track count) by artist + album name, the pair
 * every stored album has. Null when Last.fm doesn't know it.
 */
export async function fetchAlbumDetails(artist: string | null, album: string): Promise<AlbumDetails | null> {
  if (!artist || !album) return null;
  const key = requireKey();
  const url =
    `${LASTFM_BASE}?method=album.getinfo&artist=${encodeURIComponent(artist)}` +
    `&album=${encodeURIComponent(album)}&autocorrect=1&api_key=${key}&format=json`;
  const res = await providerFetch(url);
  // Unknown albums come back as a JSON error (code 6), sometimes with a 4xx.
  if (!res.ok && res.status !== 400 && res.status !== 404) {
    throw new Error(`Last.fm album info failed (${res.status})`);
  }
  return mapAlbumInfo((await res.json()) as LastfmAlbumInfoJson);
}

// ── Last.fm account (8.3) ──────────────────────────────────────────────────

/** album.getInfo with `username`: the user's plays of the album, and its track count. */
export interface AlbumUserPlays {
  userPlays: number;
  trackCount: number | null;
}

/** Null when Last.fm doesn't know the album; other API errors throw (retried next night). */
export function mapAlbumUserPlays(json: LastfmAlbumInfoJson & { album?: { userplaycount?: number | string | null } | null }): AlbumUserPlays | null {
  const info = mapAlbumInfo(json);
  if (!info) return null;
  const raw = json.album?.userplaycount;
  const plays = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : 0;
  return { userPlays: Number.isFinite(plays) && plays > 0 ? Math.floor(plays) : 0, trackCount: info.trackCount };
}

export async function fetchAlbumUserPlays(artist: string, album: string, username: string): Promise<AlbumUserPlays | null> {
  const key = requireKey();
  const url =
    `${LASTFM_BASE}?method=album.getinfo&artist=${encodeURIComponent(artist)}` +
    `&album=${encodeURIComponent(album)}&username=${encodeURIComponent(username)}` +
    `&autocorrect=1&api_key=${key}&format=json`;
  const res = await providerFetch(url);
  if (!res.ok && res.status !== 400 && res.status !== 404) throw new Error(`Last.fm album info failed (${res.status})`);
  return mapAlbumUserPlays(await res.json());
}

/** user.getInfo: the account's canonical name, or null when there is no such user (error 6). */
export function lastfmUserName(json: { error?: number; message?: string; user?: { name?: string | null } | null }): string | null {
  if (json.error === LASTFM_NOT_FOUND) return null;
  if (json.error) throw new Error(`Last.fm user lookup failed (error ${json.error}: ${json.message ?? 'unknown'})`);
  return json.user?.name?.trim() || null;
}

export async function fetchLastfmUser(username: string): Promise<string | null> {
  const key = requireKey();
  const url = `${LASTFM_BASE}?method=user.getinfo&user=${encodeURIComponent(username)}&api_key=${key}&format=json`;
  const res = await providerFetch(url);
  if (!res.ok && res.status !== 400 && res.status !== 404) throw new Error(`Last.fm user lookup failed (${res.status})`);
  return lastfmUserName(await res.json());
}

// ── More by the same people (5.10) ─────────────────────────────────────────

/** `artist.getTopAlbums` (format=json). */
export interface LastfmTopAlbumsJson {
  topalbums?: {
    album?: Array<{
      name?: string | null;
      mbid?: string | null;
      playcount?: number | string | null;
      artist?: { name?: string | null } | null;
      image?: LastfmImage[] | null;
    }> | null;
  } | null;
  error?: number;
  message?: string;
}

/**
 * An artist's top albums as add-ready results (the same externalId rule as
 * search: the MusicBrainz id, else "artist::album"). Last.fm's "(null)"
 * placeholder albums are dropped.
 */
export function mapTopAlbums(json: LastfmTopAlbumsJson, fallbackArtist: string): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  const seen = new Set<string>();
  for (const a of asArray(json.topalbums?.album ?? undefined)) {
    const name = a?.name?.trim();
    if (!name || name === '(null)') continue;
    const artist = a.artist?.name?.trim() || fallbackArtist;
    const externalId = a.mbid && a.mbid.length ? a.mbid : `${artist}::${name}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const image = pickImage(a.image);
    out.push({
      externalId,
      title: name,
      imageUrl: image,
      subtitle: artist,
      year: null,
      description: null,
      fields: { externalId, title: name, imageUrl: image, description: null, year: null, artist, trackCount: null },
    });
  }
  return out;
}

/** An artist's top albums on Last.fm (up to 30). Throws on failures and without a key. */
export async function fetchArtistTopAlbums(artist: string): Promise<NormalizedResult[]> {
  const a = artist.trim();
  if (!a) return [];
  const key = requireKey();
  const res = await providerFetch(
    `${LASTFM_BASE}?method=artist.gettopalbums&artist=${encodeURIComponent(a)}&autocorrect=1&limit=30&api_key=${key}&format=json`,
  );
  if (!res.ok) throw new Error(`Last.fm top albums failed (${res.status})`);
  const json = (await res.json()) as LastfmTopAlbumsJson;
  if (json.error === 6) return []; // artist not found
  if (json.error) throw new Error(`Last.fm top albums failed (${json.message ?? json.error})`);
  return mapTopAlbums(json, a);
}
