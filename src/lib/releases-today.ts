// ───────────────────────────────────────────────────────────────────────────
//  "Out today" (spec 5.7): which of a user's titles to announce on a given
//  day of THEIR time zone (G10). Pure; the `releases` job (06:00) supplies
//  the rows and sends what this returns through `notify`, whose dedupe key
//  makes it once per (user, kind, item, day).
//
//  - A Planned title whose release day is today (any section).
//  - The next episode of a show you are watching (TMDB `nextAirDate`) today.
//  - The next episode of an anime you are watching, when AniList's airing
//    time falls on today in your zone.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import { todayYmd } from '@/lib/release';
import type { Status } from '@/lib/status';
import { universalTitleHref } from '@/lib/title-href';

export interface ReleaseRow {
  activityId: string;
  slug: CategorySlug;
  status: Status;
  title: string;
  releaseDate?: string | null;
  nextAirDate?: string | null;
  nextAiringAt?: Date | null;
  nextAiringEpisode?: number | null;
}

export interface ReleaseNotice {
  activityId: string;
  title: string;
  body: string;
  url: string;
  dedupeKey: string;
}

/** The calendar day (YYYY-MM-DD) of an instant in a time zone. */
export function dayIn(at: Date, timeZone: string): string {
  return todayYmd(timeZone, at);
}

/**
 * Today's notices for one user, given their rows, their today and their zone.
 * Sections the user hid (`hidden`) stay quiet, as on the calendar.
 */
export function releasesDueToday(
  rows: readonly ReleaseRow[],
  today: string,
  timeZone: string,
  hidden: readonly string[] = [],
): ReleaseNotice[] {
  const out: ReleaseNotice[] = [];
  for (const r of rows) {
    if (hidden.includes(r.slug)) continue;
    // Stored with the notification: the universal link, whatever the title view.
    const url = universalTitleHref(r.slug, r.activityId);
    if (r.status === 'PLANNED' && r.releaseDate === today) {
      out.push({
        activityId: r.activityId,
        title: `Out today: ${r.title}`,
        body: `${r.title} comes out today.`,
        url,
        dedupeKey: `release:${r.activityId}:${today}`,
      });
      continue;
    }
    if (r.status !== 'CONSUMING') continue;
    if (r.slug === 'tv' && r.nextAirDate === today) {
      out.push({
        activityId: r.activityId,
        title: `New episode today: ${r.title}`,
        body: `A new episode of ${r.title} airs today.`,
        url,
        dedupeKey: `episode:${r.activityId}:${today}`,
      });
    } else if (r.slug === 'anime' && r.nextAiringAt && dayIn(r.nextAiringAt, timeZone) === today) {
      const ep = r.nextAiringEpisode ? `Episode ${r.nextAiringEpisode}` : 'A new episode';
      out.push({
        activityId: r.activityId,
        title: `New episode today: ${r.title}`,
        body: `${ep} of ${r.title} airs today.`,
        url,
        dedupeKey: `episode:${r.activityId}:${today}`,
      });
    }
  }
  return out;
}
