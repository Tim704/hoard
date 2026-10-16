// ───────────────────────────────────────────────────────────────────────────
//  AniList (GraphQL) provider — anime + manga. No API key required.
//  Replaces the old Jikan/MyAnimeList proxy, which frequently 504s when its
//  upstream (MyAnimeList) rate-limits or refuses Jikan's servers. AniList serves
//  the same catalogue directly from its own database, so it stays up even during
//  a MAL outage.
//  Server-only. fetch with { cache: 'no-store' }.
// ───────────────────────────────────────────────────────────────────────────

import type { NormalizedResult } from '@/lib/types';

const ANILIST_URL = 'https://graphql.anilist.co';

// AniList occasionally returns 429 (rate limit, ~90 req/min) or transient 5xx.
// Retry those with backoff before surfacing an error.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AniListTitle {
  romaji?: string | null;
  english?: string | null;
}

interface AniListMedia {
  id: number;
  idMal?: number | null;
  title?: AniListTitle | null;
  coverImage?: { large?: string | null; medium?: string | null } | null;
  description?: string | null;
  seasonYear?: number | null;
  startDate?: { year?: number | null } | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  averageScore?: number | null; // 0–100 on AniList
  studios?: { nodes?: Array<{ name?: string | null }> | null } | null;
}

interface AniListResponse<T> {
  data?: { Page?: { media?: T[] | null } | null } | null;
  errors?: Array<{ message?: string }> | null;
}

/**
 * POST a GraphQL query to AniList, retrying transient failures (429/5xx) and
 * per-attempt timeouts with exponential backoff. Throws with `label` in the
 * message if all attempts fail so the caller can surface a meaningful error.
 */
export async function anilistQuery<T = AniListMedia>(
  query: string,
  variables: Record<string, unknown>,
  label: string,
): Promise<T[]> {
  let lastStatus = 0;
  let retryAfterMs = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Abort a single slow attempt so one hung request doesn't stall the search.
      const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const json = (await res.json()) as AniListResponse<T>;
        if (json.errors?.length) {
          throw new Error(`${label} failed (${json.errors[0]?.message ?? 'GraphQL error'})`);
        }
        return json.data?.Page?.media ?? [];
      }

      lastStatus = res.status;
      // On 429, AniList says how long to back off; honour it (capped at 10s).
      retryAfterMs =
        res.status === 429
          ? Math.min(10, Number(res.headers.get('retry-after')) || 5) * 1000
          : 0;
      if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) {
        throw new Error(`${label} failed (${res.status})`);
      }
    } catch (err) {
      // On the final attempt, rethrow (network error, timeout, GraphQL error,
      // or the thrown non-retryable status above).
      if (attempt === MAX_ATTEMPTS) {
        if (err instanceof Error && err.message.startsWith(label)) throw err;
        const detail = lastStatus ? `${lastStatus}` : 'timeout/network';
        throw new Error(`${label} failed (${detail})`);
      }
    }

    // Backoff: 400ms, 800ms before the next attempt.
    await sleep(Math.max(retryAfterMs, 400 * attempt));
    retryAfterMs = 0;
  }

  throw new Error(`${label} failed (${lastStatus || 'unknown'})`);
}

/**
 * AniList descriptions are HTML (<br>, <i>, entities). Strip tags and decode the
 * handful of entities AniList actually emits so the stored plain text is clean.
 */
function cleanDescription(html?: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

/**
 * Stable externalId: reuse the MyAnimeList id when AniList exposes one, so
 * records added via the old Jikan provider (keyed on MAL id) don't duplicate.
 * AniList-only titles get an `al-` prefix to avoid colliding with a MAL id.
 */
function externalId(m: AniListMedia): string {
  return m.idMal != null ? String(m.idMal) : `al-${m.id}`;
}

/** AniList scores are 0–100; convert to the 0–10 MAL-style scale (1 decimal). */
function toMalScale(score?: number | null): number | null {
  if (score == null) return null;
  return Math.round(score) / 10;
}

const ANIME_QUERY = `
query ($q: String) {
  Page(perPage: 20) {
    media(search: $q, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
      id
      idMal
      title { romaji english }
      coverImage { large medium }
      description
      seasonYear
      startDate { year }
      episodes
      averageScore
      studios(isMain: true) { nodes { name } }
    }
  }
}`;

const MANGA_QUERY = `
query ($q: String) {
  Page(perPage: 20) {
    media(search: $q, type: MANGA, isAdult: false, sort: SEARCH_MATCH) {
      id
      idMal
      title { romaji english }
      coverImage { large medium }
      description
      startDate { year }
      chapters
      volumes
      averageScore
    }
  }
}`;

export async function searchAnime(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];

  const media = await anilistQuery(ANIME_QUERY, { q }, 'AniList anime search');

  return media.map((a): NormalizedResult => {
    const title = a.title?.english || a.title?.romaji || 'Untitled';
    const image = a.coverImage?.large ?? a.coverImage?.medium ?? null;
    const year = a.seasonYear ?? a.startDate?.year ?? null;
    const episodes = a.episodes ?? null;
    const malScore = toMalScale(a.averageScore);
    const studio = a.studios?.nodes?.[0]?.name ?? null;
    const description = cleanDescription(a.description);

    const subtitleParts: string[] = [];
    if (year) subtitleParts.push(String(year));
    if (episodes) subtitleParts.push(`${episodes} eps`);
    if (studio) subtitleParts.push(studio);

    const id = externalId(a);

    return {
      externalId: id,
      title,
      imageUrl: image,
      subtitle: subtitleParts.length ? subtitleParts.join(' · ') : null,
      year,
      description,
      // EXACTLY the Anime table columns (+ externalId + title).
      fields: {
        externalId: id,
        title,
        imageUrl: image,
        description,
        year,
        episodes,
        malScore,
        studio,
      },
    };
  });
}

export async function searchManga(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];

  const media = await anilistQuery(MANGA_QUERY, { q }, 'AniList manga search');

  return media.map((m): NormalizedResult => {
    const title = m.title?.english || m.title?.romaji || 'Untitled';
    const image = m.coverImage?.large ?? m.coverImage?.medium ?? null;
    const year = m.startDate?.year ?? null;
    const chapters = m.chapters ?? null;
    const volumes = m.volumes ?? null;
    const malScore = toMalScale(m.averageScore);
    const description = cleanDescription(m.description);

    const subtitleParts: string[] = [];
    if (year) subtitleParts.push(String(year));
    if (volumes) subtitleParts.push(`${volumes} vol`);
    if (chapters) subtitleParts.push(`${chapters} ch`);

    const id = externalId(m);

    return {
      externalId: id,
      title,
      imageUrl: image,
      subtitle: subtitleParts.length ? subtitleParts.join(' · ') : null,
      year,
      description,
      // EXACTLY the Manga table columns (+ externalId + title).
      fields: {
        externalId: id,
        title,
        imageUrl: image,
        description,
        year,
        chapters,
        volumes,
        malScore,
      },
    };
  });
}
