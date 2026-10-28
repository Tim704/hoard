// ───────────────────────────────────────────────────────────────────────────
//  The seven media domains, and everything the app needs to treat them
//  uniformly: URL slug, display labels, the matching Prisma model / relation /
//  foreign-key name, the DB enum value, and the metadata provider.
//
//  This module is intentionally dependency-free (no @prisma/client import) so it
//  is safe to import from client components. The string literals below MUST stay
//  in sync with prisma/schema.prisma (enum values, model names, FK fields).
// ───────────────────────────────────────────────────────────────────────────

export type CategorySlug =
  | 'books'
  | 'movies'
  | 'tv'
  | 'anime'
  | 'manga'
  | 'games'
  | 'music';

export type DbCategory = 'BOOK' | 'MOVIE' | 'TV' | 'ANIME' | 'MANGA' | 'GAME' | 'MUSIC';

export type FkField =
  | 'bookId'
  | 'movieId'
  | 'tvShowId'
  | 'animeId'
  | 'mangaId'
  | 'videoGameId'
  | 'musicAlbumId';

/**
 * Prisma client accessor name for the media model. This is ALSO the relation
 * field name on UserMediaActivity (e.g. prisma.movie / activity.movie), so it
 * can be used both for `prisma[model]` and for the `include: { [model]: true }`.
 */
export type PrismaModel =
  | 'book'
  | 'movie'
  | 'tvShow'
  | 'anime'
  | 'manga'
  | 'videoGame'
  | 'musicAlbum';

export interface CategoryConfig {
  slug: CategorySlug;
  label: string; // plural, e.g. "Movies"
  singular: string; // e.g. "Movie"
  dbCategory: DbCategory;
  fkField: FkField;
  prismaModel: PrismaModel;
  source: string; // metadata provider label shown in the UI
  /** lucide-react icon component name (resolved in the sidebar). */
  icon: string;
  /** Tailwind text-color accent for the domain. */
  accent: string;
  blurb: string;
}

export const CATEGORIES: Record<CategorySlug, CategoryConfig> = {
  books: {
    slug: 'books',
    label: 'Books',
    singular: 'Book',
    dbCategory: 'BOOK',
    fkField: 'bookId',
    prismaModel: 'book',
    source: 'OpenLibrary',
    icon: 'BookOpen',
    accent: 'text-amber-400',
    blurb: 'Tomes you swear you will finish.',
  },
  movies: {
    slug: 'movies',
    label: 'Movies',
    singular: 'Movie',
    dbCategory: 'MOVIE',
    fkField: 'movieId',
    prismaModel: 'movie',
    source: 'TMDB',
    icon: 'Clapperboard',
    accent: 'text-sky-400',
    blurb: 'Two hours you can never get back.',
  },
  tv: {
    slug: 'tv',
    label: 'TV Shows',
    singular: 'TV Show',
    dbCategory: 'TV',
    fkField: 'tvShowId',
    prismaModel: 'tvShow',
    source: 'TMDB',
    icon: 'Tv',
    accent: 'text-indigo-400',
    blurb: 'Seasons that outlived their welcome.',
  },
  anime: {
    slug: 'anime',
    label: 'Anime',
    singular: 'Anime',
    dbCategory: 'ANIME',
    fkField: 'animeId',
    prismaModel: 'anime',
    source: 'AniList',
    icon: 'Sparkles',
    accent: 'text-pink-400',
    blurb: 'Just one more episode. Honest.',
  },
  manga: {
    slug: 'manga',
    label: 'Manga',
    singular: 'Manga',
    dbCategory: 'MANGA',
    fkField: 'mangaId',
    prismaModel: 'manga',
    source: 'AniList',
    icon: 'BookText',
    accent: 'text-rose-400',
    blurb: 'Read right-to-left, regret left-to-right.',
  },
  games: {
    slug: 'games',
    label: 'Video Games',
    singular: 'Video Game',
    dbCategory: 'GAME',
    fkField: 'videoGameId',
    prismaModel: 'videoGame',
    source: 'IGDB',
    icon: 'Gamepad2',
    accent: 'text-emerald-400',
    blurb: 'Backlog measured in human lifetimes.',
  },
  music: {
    slug: 'music',
    label: 'Albums',
    singular: 'Album',
    dbCategory: 'MUSIC',
    fkField: 'musicAlbumId',
    prismaModel: 'musicAlbum',
    source: 'Last.fm',
    icon: 'Disc3',
    accent: 'text-fuchsia-400',
    blurb: 'Records you mean to listen to fully.',
  },
};

export const CATEGORY_LIST: CategoryConfig[] = Object.values(CATEGORIES);

/**
 * The order sections are shown in the navigation and on the dashboard
 * (independent of the declaration order above): Books, Movies, Anime, Video
 * Games, then TV, Manga, Music.
 */
export const NAV_ORDER: CategorySlug[] = ['books', 'movies', 'anime', 'games', 'tv', 'manga', 'music'];

export const CATEGORY_SLUGS = Object.keys(CATEGORIES) as CategorySlug[];

export function isCategorySlug(slug: string): slug is CategorySlug {
  return slug in CATEGORIES;
}

export function getCategory(slug: string): CategoryConfig | undefined {
  return isCategorySlug(slug) ? CATEGORIES[slug] : undefined;
}
