// ───────────────────────────────────────────────────────────────────────────
//  The `releases` job (spec 5.7, 06:00 server time): tell each user about
//  their titles out today and today's new episodes of what they are watching
//  (src/lib/releases-today.ts decides), with "today" in THEIR time zone.
//  `notify` dedupes per (user, item, day), so a re-run or a catch-up run
//  never sends twice, and pushes only the kinds the user enabled. Sections
//  the user hid are skipped, like on the calendar.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { notify } from '@/lib/notify';
import { effectiveTimeZone, parsePrefs, type Prefs } from '@/lib/prefs';
import { todayYmd } from '@/lib/release';
import { releasesDueToday, type ReleaseRow } from '@/lib/releases-today';
import type { Status } from '@/lib/status';
import { displayTitle } from '@/lib/title';

/** The rows that might be due today for one user. */
async function rowsFor(userId: string, today: string, now: Date, prefs: Prefs) {
  const rows: ReleaseRow[] = [];
  const hidden = new Set<string>(prefs.hiddenSections);
  for (const cat of CATEGORY_LIST) {
    // Hidden sections stay quiet, as on the calendar.
    if (hidden.has(cat.slug)) continue;
    const extra =
      cat.slug === 'tv'
        ? [{ status: 'CONSUMING' as const, tvShow: { is: { nextAirDate: today } } }]
        : cat.slug === 'anime'
          ? [
              {
                status: 'CONSUMING' as const,
                // A wide window around today; the user's day is decided in JS.
                anime: { is: { nextAiringAt: { gte: new Date(now.getTime() - 2 * 86_400_000), lte: new Date(now.getTime() + 2 * 86_400_000) } } },
              },
            ]
          : [];
    const found = await prisma.userMediaActivity.findMany({
      where: {
        userId,
        category: cat.dbCategory,
        OR: [{ status: 'PLANNED', [cat.prismaModel]: { is: { releaseDate: today } } }, ...extra],
      } as any,
      include: { [cat.prismaModel]: true } as any,
    });
    for (const a of found as any[]) {
      const m = a[cat.prismaModel];
      if (!m) continue;
      rows.push({
        activityId: a.id,
        slug: cat.slug,
        status: a.status as Status,
        title: displayTitle(m, prefs.titleLanguage),
        releaseDate: m.releaseDate ?? null,
        nextAirDate: m.nextAirDate ?? null,
        nextAiringAt: m.nextAiringAt ?? null,
        nextAiringEpisode: m.nextAiringEpisode ?? null,
      });
    }
  }
  return rows;
}

export async function runReleases(now: Date = new Date()): Promise<{ sent: number }> {
  const users = await prisma.user.findMany({ select: { id: true, prefs: true } });
  let sent = 0;
  const failed: string[] = [];
  for (const u of users) {
    try {
      const prefs = parsePrefs(u.prefs);
      const tz = effectiveTimeZone(prefs);
      const today = todayYmd(tz, now);
      const notices = releasesDueToday(await rowsFor(u.id, today, now, prefs), today, tz, prefs.hiddenSections);
      for (const n of notices) {
        const res = await notify(u.id, { kind: 'releases', title: n.title, body: n.body, url: n.url, dedupeKey: n.dedupeKey });
        if (res.id) sent++;
      }
    } catch (err) {
      failed.push(`${u.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failed.length) throw new Error(`Releases: ${failed.length} user(s) failed: ${failed.slice(0, 3).join('; ')}`);
  return { sent };
}
