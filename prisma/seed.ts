// ───────────────────────────────────────────────────────────────────────────
//  HOARD — demo seed
//
//  Creates a single `demo` user (password `demo1234`) so you can log in without
//  registering, plus a small demo library (books, movies, anime with mixed
//  statuses, scores, tiers and an Up next queue) so every page has something to
//  render and `npm run smoke` is reproducible from a fresh database.
//  Idempotent: existing rows are left untouched, so re-running it never undoes
//  changes made in the app. Catalogue rows use `demo-` externalIds, which can
//  never collide with real provider ids. Runs under `tsx` via the prisma seed
//  hook (`npx prisma db seed`).
// ───────────────────────────────────────────────────────────────────────────

import { PrismaClient, type MediaStatus, type Tier } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo1234';

async function main() {
  // upsert keeps this side-effect-safe: if `demo` already exists we leave it
  // untouched (empty `update`), otherwise we create it with a hashed password.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { username: DEMO_USERNAME },
    update: {},
    create: {
      username: DEMO_USERNAME,
      passwordHash,
    },
  });

  await seedLibrary(user.id);
  await seedShareLink(user.id);
  await seedLists(user.id);
  await seedStats(user.id);

  console.log('[seed] Demo user ready.');
  console.log(`[seed]   username: ${DEMO_USERNAME}`);
  console.log(`[seed]   password: ${DEMO_PASSWORD}`);
}

/** The demo books tier list's fixed share token, visited by the smoke test. */
export const DEMO_SHARE_TOKEN = 'demo-share-books';

/**
 * A public link to the demo books tier list (4.1), so `npm run smoke` can open
 * /s/demo-share-books. Never in production: a guessable token there would be
 * a public page nobody asked for.
 */
async function seedShareLink(userId: string) {
  if (process.env.NODE_ENV === 'production') return;
  await prisma.shareLink.upsert({
    where: { id: DEMO_SHARE_TOKEN },
    update: {},
    create: { id: DEMO_SHARE_TOKEN, userId, kind: 'tiers', target: 'books' },
  });
}

/** Fixed ids of the demo lists (4.8 / 4.11), visited by the smoke test. */
export const DEMO_LIST_ID = 'demo-list-comfort';
export const DEMO_REF_LIST_ID = 'demo-reflist-scifi';
export const DEMO_LIST_SHARE_TOKEN = 'demo-share-list-comfort';

/**
 * A demo custom list (with a public link) and a demo reference list, so the
 * smoke test can open /lists/…, /lists/ref/… and /s/demo-share-list. Never in
 * production (guessable ids). Items point at the demo catalogue rows.
 */
async function seedLists(userId: string) {
  if (process.env.NODE_ENV === 'production') return;
  const list = await prisma.customList.findUnique({ where: { id: DEMO_LIST_ID } });
  if (!list) {
    await prisma.customList.create({
      data: { id: DEMO_LIST_ID, ownerId: userId, name: 'Comfort picks', description: 'Things to come back to on a slow Sunday.' },
    });
    const picks = [
      { category: 'movies', row: await prisma.movie.findUnique({ where: { externalId: 'demo-movie-alien' } }) },
      { category: 'books', row: await prisma.book.findUnique({ where: { externalId: 'demo-book-dune' } }) },
      { category: 'anime', row: await prisma.anime.findUnique({ where: { externalId: 'demo-anime-cowboy-bebop' } }) },
    ];
    let position = 0;
    for (const p of picks) {
      if (!p.row) continue;
      await prisma.customListItem.create({
        data: { listId: DEMO_LIST_ID, category: p.category, mediaId: p.row.id, addedById: userId, position: (position += 1000) },
      });
    }
  }
  await prisma.shareLink.upsert({
    where: { id: DEMO_LIST_SHARE_TOKEN },
    update: {},
    create: { id: DEMO_LIST_SHARE_TOKEN, userId, kind: 'list', target: DEMO_LIST_ID },
  });

  if (!(await prisma.refList.findUnique({ where: { id: DEMO_REF_LIST_ID } }))) {
    await prisma.refList.create({
      data: {
        id: DEMO_REF_LIST_ID,
        userId,
        name: 'Sci-fi essentials',
        source: 'custom',
        category: 'movies',
        items: {
          create: [
            { category: 'movies', externalId: 'demo-movie-alien', title: 'Alien', year: 1979, position: 1 },
            { category: 'movies', externalId: 'demo-movie-stalker', title: 'Stalker', year: 1979, position: 2 },
            { category: 'movies', externalId: 'demo-movie-arrival', title: 'Arrival', year: 2016, position: 3 },
            { category: 'movies', externalId: 'demo-movie-solaris', title: 'Solaris', year: 1972, position: 4 },
          ],
        },
      },
    });
  }
}

/** The demo year in review's fixed share token (6.1), visited by the smoke test. */
export const DEMO_YEAR_SHARE_TOKEN = 'demo-share-year-review';

/**
 * A goal for this year (so the dashboard tile and the Goals tab have data) and
 * a public link to this year's review. Never in production (guessable token).
 */
async function seedStats(userId: string) {
  if (process.env.NODE_ENV === 'production') return;
  const year = new Date().getFullYear();
  const goal = await prisma.goal.findFirst({ where: { userId, year, category: null, metric: 'count' } });
  if (!goal) await prisma.goal.create({ data: { userId, year, category: null, metric: 'count', target: 24 } });
  await prisma.shareLink.upsert({
    where: { id: DEMO_YEAR_SHARE_TOKEN },
    update: {},
    create: { id: DEMO_YEAR_SHARE_TOKEN, userId, kind: 'year', target: String(year) },
  });
}

// ── Demo library ─────────────────────────────────────────────────────────────

interface DemoEntry {
  key: string; // externalId suffix
  title: string;
  year: number;
  status: MediaStatus;
  rating?: number;
  tier?: Tier;
  queued?: boolean;
  progress?: number;
  favorite?: boolean;
  /** The provider's community score (TMDB / MAL), for "You vs. the crowd". */
  crowd?: number;
  tags?: string[];
  /** A release this many days from the seed run (5.4 / 5.9: "Not out yet", countdowns). */
  releaseInDays?: number;
  genres?: string[];
}

/** YYYY-MM-DD `days` from today (UTC), for the demo's upcoming release. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const BOOKS: DemoEntry[] = [
  { key: 'dune', title: 'Dune', year: 1965, status: 'COMPLETED', rating: 9.2, tier: 'S', favorite: true, tags: ['Classic', 'Sci-fi'] },
  { key: 'neuromancer', title: 'Neuromancer', year: 1984, status: 'COMPLETED', rating: 8.5, tier: 'A', tags: ['Sci-fi', 'Cyberpunk'] },
  { key: 'hyperion', title: 'Hyperion', year: 1989, status: 'COMPLETED', rating: 8.4 },
  { key: 'snow-crash', title: 'Snow Crash', year: 1992, status: 'COMPLETED' },
  { key: 'ubik', title: 'Ubik', year: 1969, status: 'CONSUMING', rating: 7, progress: 120 },
  { key: 'foundation', title: 'Foundation', year: 1951, status: 'PLANNED', queued: true },
  { key: 'solaris', title: 'Solaris', year: 1961, status: 'PLANNED', queued: true },
];

const MOVIES: DemoEntry[] = [
  { key: 'alien', title: 'Alien', year: 1979, status: 'COMPLETED', rating: 8.8, tier: 'S', favorite: true, crowd: 8.2, tags: ['Sci-fi'] },
  { key: 'aliens', title: 'Aliens', year: 1986, status: 'COMPLETED', rating: 8.8, tier: 'S', crowd: 7.9 },
  { key: 'heat', title: 'Heat', year: 1995, status: 'COMPLETED', rating: 8.1, crowd: 7.9 },
  { key: 'arrival', title: 'Arrival', year: 2016, status: 'DROPPED', rating: 5.5, crowd: 7.6 },
  { key: 'stalker', title: 'Stalker', year: 1979, status: 'PLANNED', queued: true, genres: ['Science Fiction', 'Drama'] },
  // Always ~3 weeks out (refreshed on every seed run): Up next's "Not out yet",
  // the countdown badge and the dashboard's "Coming up".
  { key: 'upcoming', title: 'The Next Big Thing', year: 2026, status: 'PLANNED', queued: true, releaseInDays: 21, genres: ['Science Fiction'] },
];

const ANIME: DemoEntry[] = [
  { key: 'cowboy-bebop', title: 'Cowboy Bebop', year: 1998, status: 'COMPLETED', rating: 9, tier: 'S', favorite: true, crowd: 8.8 },
  { key: 'haikyuu', title: 'Haikyuu!!', year: 2014, status: 'COMPLETED', rating: 8.6, crowd: 8.4 },
  { key: 'mushishi', title: 'Mushishi', year: 2005, status: 'ON_HOLD', rating: 8.2 },
  { key: 'frieren', title: 'Frieren', year: 2023, status: 'CONSUMING', progress: 9 },
  { key: 'one-piece', title: 'One Piece', year: 1999, status: 'RETIRED', rating: 7.5 },
  { key: 'monster', title: 'Monster', year: 2004, status: 'PLANNED', queued: true },
];

async function seedLibrary(userId: string) {
  await seedCategory(userId, 'BOOK', BOOKS, (e) =>
    prisma.book.upsert({
      where: { externalId: `demo-book-${e.key}` },
      update: {},
      create: { externalId: `demo-book-${e.key}`, title: e.title, year: e.year, authors: ['Demo Author'], pageCount: 240 },
    }),
    'bookId',
  );
  await seedCategory(userId, 'MOVIE', MOVIES, (e) => {
    const releaseDate = e.releaseInDays != null ? daysFromNow(e.releaseInDays) : null;
    return prisma.movie.upsert({
      where: { externalId: `demo-movie-${e.key}` },
      // Catalogue only: keep the demo release in the future on every run.
      update: releaseDate ? { releaseDate, year: Number(releaseDate.slice(0, 4)) } : {},
      create: {
        externalId: `demo-movie-${e.key}`,
        title: e.title,
        year: releaseDate ? Number(releaseDate.slice(0, 4)) : e.year,
        runtime: 120,
        tmdbRating: e.crowd ?? null,
        releaseDate,
        genres: e.genres ?? [],
      },
    });
  },
    'movieId',
  );
  await seedCategory(userId, 'ANIME', ANIME, (e) =>
    prisma.anime.upsert({
      where: { externalId: `demo-anime-${e.key}` },
      // Catalogue only: Frieren's next episode airs in 3 days (the calendar, 5.6).
      update: e.key === 'frieren' ? frierenAiring() : {},
      create: {
        externalId: `demo-anime-${e.key}`,
        title: e.title,
        year: e.year,
        episodes: 24,
        malScore: e.crowd ?? null,
        ...(e.key === 'frieren' ? frierenAiring() : {}),
      },
    }),
    'animeId',
  );
  await seedTv(userId);
  console.log('[seed] Demo library ready.');
}

function frierenAiring() {
  return { nextAiringAt: new Date(Date.now() + 3 * 86_400_000), nextAiringEpisode: 10 };
}

/** The demo show's activity id, fixed so the smoke test can visit its season tiers. */
export const DEMO_TV_ACTIVITY_ID = 'demo-activity-tv-expanse';

const DEMO_SEASONS = [
  { seasonNumber: 1, episodeCount: 10, airDate: '2015-12-14', watched: 10, rating: 8.4, tier: 'A' as Tier },
  { seasonNumber: 2, episodeCount: 13, airDate: '2017-02-01', watched: 13, rating: 9.1, tier: 'S' as Tier },
  { seasonNumber: 3, episodeCount: 13, airDate: '2018-04-11', ticks: [1, 2, 3], rating: 8.7 },
];

/**
 * A demo show with three seasons (3.3 / 4.5): two finished and tiered, one in
 * progress with episode ticks, so the Seasons section, the season tier page
 * and its Arena (two seasons share the whole score 8) all have data.
 */
async function seedTv(userId: string) {
  // Catalogue only: the calendar (5.6) always has a next episode ~5 days out.
  const airing = { status: 'Returning Series', nextAirDate: daysFromNow(5) };
  const show = await prisma.tvShow.upsert({
    where: { externalId: 'demo-tv-expanse' },
    update: airing,
    create: {
      externalId: 'demo-tv-expanse',
      title: 'The Expanse',
      year: 2015,
      episodeCount: 36,
      seasonCount: 3,
      tmdbRating: 8.1,
      ...airing,
    },
  });
  const seasons = [];
  for (const s of DEMO_SEASONS) {
    seasons.push(
      await prisma.tvSeason.upsert({
        where: { tvShowId_seasonNumber: { tvShowId: show.id, seasonNumber: s.seasonNumber } },
        update: {},
        create: {
          tvShowId: show.id,
          seasonNumber: s.seasonNumber,
          name: `Season ${s.seasonNumber}`,
          episodeCount: s.episodeCount,
          airDate: s.airDate,
        },
      }),
    );
  }

  const existing = await prisma.userMediaActivity.findFirst({ where: { userId, tvShowId: show.id } });
  if (existing) return; // never touch what the user changed in the app
  const progress = DEMO_SEASONS.reduce((n, s) => n + (s.ticks?.length ?? s.watched ?? 0), 0);
  await prisma.userMediaActivity.create({
    data: {
      id: DEMO_TV_ACTIVITY_ID,
      userId,
      category: 'TV',
      tvShowId: show.id,
      status: 'CONSUMING',
      rating: 8.8,
      progress,
    },
  });
  let rank = 0;
  for (const [i, s] of DEMO_SEASONS.entries()) {
    await prisma.seasonActivity.create({
      data: {
        userId,
        activityId: DEMO_TV_ACTIVITY_ID,
        seasonId: seasons[i].id,
        watchedEpisodes: s.ticks?.length ?? s.watched ?? 0,
        episodesWatched: s.ticks ?? [],
        rating: s.rating,
        tier: s.tier ?? null,
        rankOrder: s.tier ? (rank += 1000) : null,
      },
    });
  }
}

async function seedCategory(
  userId: string,
  category: 'BOOK' | 'MOVIE' | 'ANIME',
  entries: DemoEntry[],
  upsertMedia: (e: DemoEntry) => Promise<{ id: string }>,
  fk: 'bookId' | 'movieId' | 'animeId',
) {
  let rank = 0;
  let queue = 0;
  for (const e of entries) {
    const media = await upsertMedia(e);
    const existing = await prisma.userMediaActivity.findFirst({ where: { userId, [fk]: media.id } });
    if (existing) continue; // never touch what the user changed in the app
    await prisma.userMediaActivity.create({
      data: {
        userId,
        category,
        [fk]: media.id,
        status: e.status,
        rating: e.rating ?? null,
        tier: e.tier ?? null,
        rankOrder: e.tier ? (rank += 1000) : null,
        queueOrder: e.queued ? (queue += 1000) : null,
        progress: e.progress ?? null,
        favorite: e.favorite ?? false,
        tags: e.tags ?? [],
        finishedAt: e.status === 'COMPLETED' ? new Date() : null,
      },
    });
  }
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
