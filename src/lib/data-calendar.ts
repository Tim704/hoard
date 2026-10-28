// ───────────────────────────────────────────────────────────────────────────
//  The calendar's items (spec 5.6), for the /calendar page and the private
//  iCal feed. Server-only; reads ONE user's library (the caller decides who:
//  the session user, or the owner of a calendar token).
//
//    release  Planned titles with a release day in the window (all sections)
//    episode  the next episode (TMDB nextAirDate) of shows you watch or
//             finished that are still returning
//    airing   AniList's next airing episode of your anime, on its day in
//             your time zone
//    sequel   announced, unreleased AniList entries of your franchises
//             (cached on Franchise.upcoming by the new-seasons job), unless
//             already in your library
// ───────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, getCategory, type CategorySlug } from '@/lib/categories';
import type { CalendarItem } from '@/lib/calendar';
import { parseUpcoming } from '@/lib/franchise/upcoming';
import { effectiveTimeZone, type Prefs } from '@/lib/prefs';
import { todayYmd } from '@/lib/release';
import { displayTitle } from '@/lib/title';

const DAY_MS = 86_400_000;

function dayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** Calendar items between `from` and `to` (inclusive YYYY-MM-DD days). */
export async function getCalendarItems(userId: string, prefs: Prefs, from: string, to: string): Promise<CalendarItem[]> {
  const tz = effectiveTimeZone(prefs);
  const lang = prefs.titleLanguage;
  const hidden = new Set<string>(prefs.hiddenSections);
  const items: CalendarItem[] = [];
  const href = (slug: CategorySlug, id: string) => `/${slug}?open=${encodeURIComponent(id)}`;

  // Planned releases, every section.
  for (const cat of CATEGORY_LIST) {
    if (hidden.has(cat.slug)) continue;
    const rows = await prisma.userMediaActivity.findMany({
      where: {
        userId,
        category: cat.dbCategory,
        status: 'PLANNED',
        [cat.prismaModel]: { is: { releaseDate: { gte: from, lte: to } } },
      } as any,
      include: { [cat.prismaModel]: true } as any,
    });
    for (const a of rows as any[]) {
      const m = a[cat.prismaModel];
      if (!m?.releaseDate) continue;
      items.push({
        uid: `release-${a.id}`,
        kind: 'release',
        date: m.releaseDate,
        title: displayTitle(m, lang),
        detail: cat.singular,
        slug: cat.slug,
        href: href(cat.slug, a.id),
        imageUrl: m.imageUrl ?? null,
      });
    }
  }

  // Next episodes of returning shows you watch or finished.
  if (!hidden.has('tv')) {
    const shows = await prisma.userMediaActivity.findMany({
      where: {
        userId,
        category: 'TV',
        status: { in: ['CONSUMING', 'COMPLETED'] },
        tvShow: { is: { nextAirDate: { gte: from, lte: to } } },
      },
      include: { tvShow: true },
    });
    for (const a of shows) {
      const m = a.tvShow;
      if (!m?.nextAirDate) continue;
      items.push({
        uid: `episode-${a.id}-${m.nextAirDate}`,
        kind: 'episode',
        date: m.nextAirDate,
        title: displayTitle(m, lang),
        detail: 'TV',
        slug: 'tv',
        href: href('tv', a.id),
        imageUrl: m.imageUrl ?? null,
      });
    }
  }

  // Anime airing, on the day it airs in the user's zone.
  if (!hidden.has('anime')) {
    const anime = await prisma.userMediaActivity.findMany({
      where: {
        userId,
        category: 'ANIME',
        status: { in: ['PLANNED', 'CONSUMING', 'COMPLETED', 'ON_HOLD'] },
        anime: {
          is: {
            nextAiringAt: {
              gte: new Date(dayStart(from).getTime() - DAY_MS),
              lt: new Date(dayStart(to).getTime() + 2 * DAY_MS),
            },
          },
        },
      },
      include: { anime: true },
    });
    for (const a of anime) {
      const m = a.anime;
      if (!m?.nextAiringAt) continue;
      const date = todayYmd(tz, m.nextAiringAt);
      if (date < from || date > to) continue;
      items.push({
        uid: `airing-${a.id}-${m.nextAiringEpisode ?? date}`,
        kind: 'airing',
        date,
        title: displayTitle(m, lang),
        detail: m.nextAiringEpisode ? `Episode ${m.nextAiringEpisode}` : 'Anime',
        slug: 'anime',
        href: href('anime', a.id),
        imageUrl: m.imageUrl ?? null,
      });
    }
  }

  // Unreleased sequels of your anime / manga franchises.
  if (!hidden.has('franchises')) {
    const franchises = await prisma.franchise.findMany({
      where: { userId, upcoming: { not: Prisma.DbNull } },
      select: { id: true, name: true, upcoming: true },
    });
    const owned = await ownedAniListIds(userId);
    const seen = new Set<string>();
    for (const f of franchises) {
      for (const e of parseUpcoming(f.upcoming)?.items ?? []) {
        if (e.date < from || e.date > to || hidden.has(e.slug)) continue;
        const key = `${e.slug}|${e.externalId}`;
        if (owned.has(key) || seen.has(key)) continue;
        seen.add(key);
        items.push({
          uid: `sequel-${f.id}-${e.slug}-${e.externalId}`,
          kind: 'sequel',
          date: e.date,
          title: e.title,
          detail: `New in ${f.name}${e.format ? ` (${e.format.replace(/_/g, ' ')})` : ''}`,
          slug: e.slug,
          href: '/franchises',
          imageUrl: e.imageUrl,
        });
      }
    }
  }

  return items;
}

/** "anime|<externalId>" / "manga|<externalId>" for everything in the user's library. */
async function ownedAniListIds(userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const slug of ['anime', 'manga'] as const) {
    const cat = getCategory(slug)!;
    const rows = await prisma.userMediaActivity.findMany({
      where: { userId, category: cat.dbCategory },
      select: { [cat.prismaModel]: { select: { externalId: true } } } as any,
    });
    for (const r of rows as any[]) {
      const id = r[cat.prismaModel]?.externalId;
      if (id) out.add(`${slug}|${id}`);
    }
  }
  return out;
}

/** The user behind a calendar token (exact match on prefs.calendarToken), or null. */
export async function userForCalendarToken(token: string): Promise<{ id: string; prefs: unknown } | null> {
  return prisma.user.findFirst({
    where: { prefs: { path: ['calendarToken'], equals: token } },
    select: { id: true, prefs: true },
  });
}
