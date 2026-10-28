// ───────────────────────────────────────────────────────────────────────────
//  AniList (GraphQL) provider — anime + manga. No API key required.
//  Replaces the old Jikan/MyAnimeList proxy, which frequently 504s when its
//  upstream (MyAnimeList) rate-limits or refuses Jikan's servers. AniList serves
//  the same catalogue directly from its own database, so it stays up even during
//  a MAL outage.
//  Server-only. fetch with { cache: 'no-store' }.
// ───────────────────────────────────────────────────────────────────────────

import { normalizeGenres } from '@/lib/genres';
import { ymdFromParts } from '@/lib/release';
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
  native?: string | null;
}

export interface AniListMedia {
  id: number;
  idMal?: number | null;
  title?: AniListTitle | null;
  coverImage?: { large?: string | null; medium?: string | null } | null;
  description?: string | null;
  seasonYear?: number | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  averageScore?: number | null; // 0–100 on AniList
  studios?: { nodes?: Array<{ name?: string | null }> | null } | null;
  genres?: string[] | null;
  nextAiringEpisode?: { airingAt?: number | null; episode?: number | null } | null;
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

const ANIME_FIELDS = `id
      idMal
      title { romaji english native }
      coverImage { large medium }
      description
      seasonYear
      startDate { year month day }
      episodes
      averageScore
      genres
      nextAiringEpisode { airingAt episode }
      studios(isMain: true) { nodes { name } }`;

const MANGA_FIELDS = `id
      idMal
      title { romaji english native }
      coverImage { large medium }
      description
      startDate { year month day }
      chapters
      volumes
      averageScore
      genres`;

const ANIME_QUERY = `
query ($q: String) {
  Page(perPage: 20) {
    media(search: $q, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
      ${ANIME_FIELDS}
    }
  }
}`;

const MANGA_QUERY = `
query ($q: String) {
  Page(perPage: 20) {
    media(search: $q, type: MANGA, isAdult: false, sort: SEARCH_MATCH) {
      ${MANGA_FIELDS}
    }
  }
}`;

/**
 * The F2 / 4.9 columns AniList gives us for one entry: title variants, the
 * start date (a full day only when AniList knows it), genres, and for anime
 * the next airing episode. Shared by search hits and the metadata job.
 * `nextAiringAt` is an ISO string (Prisma accepts it for a DateTime column,
 * and it survives the trip through a server action).
 */
export function aniListDetails(m: AniListMedia, type: 'ANIME' | 'MANGA'): Record<string, unknown> {
  const s = m.startDate;
  const details: Record<string, unknown> = {
    titleEnglish: m.title?.english?.trim() || null,
    titleRomaji: m.title?.romaji?.trim() || null,
    titleNative: m.title?.native?.trim() || null,
  };
  const releaseDate = ymdFromParts(s?.year, s?.month, s?.day);
  if (releaseDate) details.releaseDate = releaseDate;
  const genres = normalizeGenres(m.genres);
  if (genres.length) details.genres = genres;
  if (type === 'ANIME') {
    const next = m.nextAiringEpisode;
    // Null once nothing is scheduled, so a finished show stops showing a date.
    details.nextAiringAt = next?.airingAt ? new Date(next.airingAt * 1000).toISOString() : null;
    details.nextAiringEpisode = next?.airingAt && next.episode ? next.episode : null;
  }
  return details;
}

/** One anime search hit → a NormalizedResult (fields = Anime columns). */
export function mapAnime(a: AniListMedia): NormalizedResult {
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
      ...aniListDetails(a, 'ANIME'),
    },
  };
}

/** One manga search hit → a NormalizedResult (fields = Manga columns). */
export function mapManga(m: AniListMedia): NormalizedResult {
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
      ...aniListDetails(m, 'MANGA'),
    },
  };
}

export async function searchAnime(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];
  const media = await anilistQuery(ANIME_QUERY, { q }, 'AniList anime search');
  return media.map(mapAnime);
}

export async function searchManga(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];
  const media = await anilistQuery(MANGA_QUERY, { q }, 'AniList manga search');
  return media.map(mapManga);
}

/** AniList's page size: one request per 50 ids. */
const DETAILS_BATCH = 50;

/**
 * Details for many stored anime or manga at once (the metadata job), keyed by
 * our externalId: MAL ids are looked up with `idMal_in`, `al-123` ids with
 * `id_in`, 50 per request through `anilistQuery` (rate-limit aware). The patch
 * also refreshes the episode / chapter / volume counts when AniList has them.
 * Ids AniList doesn't know are simply missing from the map. Throws when a
 * request fails, so the caller can retry those rows another night.
 */
export async function fetchAniListDetails(
  type: 'ANIME' | 'MANGA',
  externalIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const fields = type === 'ANIME' ? ANIME_FIELDS : MANGA_FIELDS;
  const byMal = `query ($ids: [Int], $type: MediaType) {
    Page(perPage: ${DETAILS_BATCH}) { media(idMal_in: $ids, type: $type) { ${fields} } } }`;
  const byId = `query ($ids: [Int], $type: MediaType) {
    Page(perPage: ${DETAILS_BATCH}) { media(id_in: $ids, type: $type) { ${fields} } } }`;

  const mal: number[] = [];
  const al: number[] = [];
  for (const id of externalIds) {
    const n = Number(id.startsWith('al-') ? id.slice(3) : id);
    if (!Number.isInteger(n) || n <= 0) continue;
    (id.startsWith('al-') ? al : mal).push(n);
  }

  const out = new Map<string, Record<string, unknown>>();
  // Key each answer by the id we asked with: an `al-N` row stays `al-N` even
  // if AniList has since gained a MAL id (externalId() would prefer that).
  const run = async (query: string, ids: number[], keyOf: (m: AniListMedia) => string) => {
    for (let i = 0; i < ids.length; i += DETAILS_BATCH) {
      const media = await anilistQuery(query, { ids: ids.slice(i, i + DETAILS_BATCH), type }, 'AniList details');
      for (const m of media) out.set(keyOf(m), aniListPatch(m, type));
    }
  };
  await run(byMal, mal, (m) => String(m.idMal));
  await run(byId, al, (m) => `al-${m.id}`);
  return out;
}

/**
 * The lookup patch for one AniList entry (on add and in the metadata job):
 * details, fresh counts, and the display core — title (English, else romaji,
 * as in search), cover, cleaned description, score and studio. Core fields
 * are only included when AniList has them, so they never blank stored ones.
 */
export function aniListPatch(m: AniListMedia, type: 'ANIME' | 'MANGA'): Record<string, unknown> {
  const patch = aniListDetails(m, type);
  const title = m.title?.english?.trim() || m.title?.romaji?.trim();
  if (title) patch.title = title;
  const image = m.coverImage?.large ?? m.coverImage?.medium;
  if (image) patch.imageUrl = image;
  const description = cleanDescription(m.description);
  if (description) patch.description = description;
  const malScore = toMalScale(m.averageScore);
  if (malScore) patch.malScore = malScore;
  const studio = type === 'ANIME' ? m.studios?.nodes?.[0]?.name?.trim() : null;
  if (studio) patch.studio = studio;
  const year = m.seasonYear ?? m.startDate?.year ?? null;
  if (year) patch.year = year;
  if (type === 'ANIME' && m.episodes) patch.episodes = m.episodes;
  if (type === 'MANGA' && m.chapters) patch.chapters = m.chapters;
  if (type === 'MANGA' && m.volumes) patch.volumes = m.volumes;
  return patch;
}
