// ───────────────────────────────────────────────────────────────────────────
//  The anime season browser (spec 5.11): seasons, filters and the AniList
//  query. Pure and client-safe.
//
//  AniList seasons by month: WINTER Jan–Mar, SPRING Apr–Jun, SUMMER Jul–Sep,
//  FALL Oct–Dec. Results come 50 a page, most popular first.
// ───────────────────────────────────────────────────────────────────────────

export const ANIME_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
export type AnimeSeason = (typeof ANIME_SEASONS)[number];

export const SEASON_LABELS: Record<AnimeSeason, string> = {
  WINTER: 'Winter',
  SPRING: 'Spring',
  SUMMER: 'Summer',
  FALL: 'Fall',
};

/** AniList's genres (the Hentai genre is left out, like adult entries). */
export const ANIME_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
] as const;

export const ANIME_FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA'] as const;
export type AnimeFormat = (typeof ANIME_FORMATS)[number];

export const FORMAT_LABELS: Record<AnimeFormat, string> = {
  TV: 'TV',
  TV_SHORT: 'TV short',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
};

export const SEASON_PAGE_SIZE = 50;
export const MIN_SEASON_YEAR = 1940;

/** The season a month (1–12) belongs to. */
export function seasonForMonth(month: number): AnimeSeason {
  if (month <= 3) return 'WINTER';
  if (month <= 6) return 'SPRING';
  if (month <= 9) return 'SUMMER';
  return 'FALL';
}

/** The season and year of a YYYY-MM-DD day. */
export function currentSeason(today: string): { season: AnimeSeason; year: number } {
  return { season: seasonForMonth(Number(today.slice(5, 7))), year: Number(today.slice(0, 4)) };
}

export interface SeasonQuery {
  season: AnimeSeason;
  year: number;
  genre: string | null;
  format: AnimeFormat | null;
  page: number;
}

/** Validate a query from the client; null when anything is off. */
export function parseSeasonQuery(raw: unknown, maxYear: number): SeasonQuery | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const season = ANIME_SEASONS.find((s) => s === o.season);
  const year = typeof o.year === 'number' && Number.isInteger(o.year) ? o.year : NaN;
  if (!season || !(year >= MIN_SEASON_YEAR && year <= maxYear)) return null;
  const genre = o.genre == null || o.genre === '' ? null : ANIME_GENRES.find((g) => g === o.genre) ?? undefined;
  const format = o.format == null || o.format === '' ? null : ANIME_FORMATS.find((f) => f === o.format) ?? undefined;
  if (genre === undefined || format === undefined) return null;
  const page = typeof o.page === 'number' && Number.isInteger(o.page) && o.page >= 1 && o.page <= 20 ? o.page : null;
  if (page === null) return null;
  return { season, year, genre, format, page };
}

/** The AniList query (fields: the search mapper's own, passed in). */
export function seasonGraphql(fields: string): string {
  return `query ($season: MediaSeason, $year: Int, $genre: String, $format: MediaFormat, $page: Int) {
  Page(page: $page, perPage: ${SEASON_PAGE_SIZE}) {
    media(season: $season, seasonYear: $year, type: ANIME, isAdult: false, genre: $genre, format: $format, sort: POPULARITY_DESC) {
      ${fields}
    }
  }
}`;
}

/** The query's variables (null filters are left out, so AniList ignores them). */
export function seasonVariables(q: SeasonQuery): Record<string, unknown> {
  return {
    season: q.season,
    year: q.year,
    page: q.page,
    ...(q.genre ? { genre: q.genre } : {}),
    ...(q.format ? { format: q.format } : {}),
  };
}
