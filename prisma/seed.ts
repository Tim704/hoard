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

  console.log('[seed] Demo user ready.');
  console.log(`[seed]   username: ${DEMO_USERNAME}`);
  console.log(`[seed]   password: ${DEMO_PASSWORD}`);
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
}

const BOOKS: DemoEntry[] = [
  { key: 'dune', title: 'Dune', year: 1965, status: 'COMPLETED', rating: 9.2, tier: 'S', favorite: true },
  { key: 'neuromancer', title: 'Neuromancer', year: 1984, status: 'COMPLETED', rating: 8.5, tier: 'A' },
  { key: 'hyperion', title: 'Hyperion', year: 1989, status: 'COMPLETED', rating: 8.4 },
  { key: 'snow-crash', title: 'Snow Crash', year: 1992, status: 'COMPLETED' },
  { key: 'ubik', title: 'Ubik', year: 1969, status: 'CONSUMING', rating: 7, progress: 120 },
  { key: 'foundation', title: 'Foundation', year: 1951, status: 'PLANNED', queued: true },
  { key: 'solaris', title: 'Solaris', year: 1961, status: 'PLANNED', queued: true },
];

const MOVIES: DemoEntry[] = [
  { key: 'alien', title: 'Alien', year: 1979, status: 'COMPLETED', rating: 8.8, tier: 'S', favorite: true, crowd: 8.2 },
  { key: 'aliens', title: 'Aliens', year: 1986, status: 'COMPLETED', rating: 8.8, tier: 'S', crowd: 7.9 },
  { key: 'heat', title: 'Heat', year: 1995, status: 'COMPLETED', rating: 8.1, crowd: 7.9 },
  { key: 'arrival', title: 'Arrival', year: 2016, status: 'DROPPED', rating: 5.5, crowd: 7.6 },
  { key: 'stalker', title: 'Stalker', year: 1979, status: 'PLANNED', queued: true },
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
  await seedCategory(userId, 'MOVIE', MOVIES, (e) =>
    prisma.movie.upsert({
      where: { externalId: `demo-movie-${e.key}` },
      update: {},
      create: { externalId: `demo-movie-${e.key}`, title: e.title, year: e.year, runtime: 120, tmdbRating: e.crowd ?? null },
    }),
    'movieId',
  );
  await seedCategory(userId, 'ANIME', ANIME, (e) =>
    prisma.anime.upsert({
      where: { externalId: `demo-anime-${e.key}` },
      update: {},
      create: { externalId: `demo-anime-${e.key}`, title: e.title, year: e.year, episodes: 24, malScore: e.crowd ?? null },
    }),
    'animeId',
  );
  await seedTv(userId);
  console.log('[seed] Demo library ready.');
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
  const show = await prisma.tvShow.upsert({
    where: { externalId: 'demo-tv-expanse' },
    update: {},
    create: {
      externalId: 'demo-tv-expanse',
      title: 'The Expanse',
      year: 2015,
      episodeCount: 36,
      seasonCount: 3,
      tmdbRating: 8.1,
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
