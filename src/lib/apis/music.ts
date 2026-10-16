// ───────────────────────────────────────────────────────────────────────────
//  Last.fm provider — music albums. Requires LASTFM_API_KEY.
//  Server-only. fetch with { cache: 'no-store' }.
// ───────────────────────────────────────────────────────────────────────────

import type { NormalizedResult } from '@/lib/types';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

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
  const res = await fetch(url, { cache: 'no-store' });
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
