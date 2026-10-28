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

/** album.getInfo JSON → genres (top 3 tags) and the track count. Null on an API error. */
export function mapAlbumInfo(json: LastfmAlbumInfoJson): AlbumDetails | null {
  if (json.error || !json.album) return null;
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
