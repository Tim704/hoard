// ───────────────────────────────────────────────────────────────────────────
//  GET /api/ical/<calendarToken>.ics — the private calendar feed (spec 5.6).
//  Public (no session): the token in Settings → Calendar is the key. An
//  unknown, revoked or malformed token answers 404 like any missing page.
//  Covers the past 7 days to 180 days ahead, as all-day events.
// ───────────────────────────────────────────────────────────────────────────

import { feedWindow, KIND_LABEL } from '@/lib/calendar';
import { isCalendarTokenShape } from '@/lib/calendar-token';
import { getCalendarItems, userForCalendarToken } from '@/lib/data-calendar';
import { buildIcs } from '@/lib/ics';
import { effectiveTimeZone, parsePrefs } from '@/lib/prefs';
import { absoluteUrl } from '@/lib/public-url';
import { todayYmd } from '@/lib/release';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const raw = params.token ?? '';
  if (!raw.endsWith('.ics')) return notFound();
  const token = raw.slice(0, -4);
  if (!isCalendarTokenShape(token)) return notFound();
  try {
    const user = await userForCalendarToken(token);
    if (!user) return notFound();
    const prefs = parsePrefs(user.prefs);
    // The JSON-path match is exact, but check again against the parsed value.
    if (prefs.calendarToken !== token) return notFound();
    const now = new Date();
    const { from, to } = feedWindow(todayYmd(effectiveTimeZone(prefs), now));
    const items = await getCalendarItems(user.id, prefs, from, to);
    const body = buildIcs({
      name: 'Hoard',
      now,
      events: items.map((it) => ({
        uid: `${it.uid}@hoard`,
        date: it.date,
        summary: it.title,
        description: `${KIND_LABEL[it.kind]} · ${it.detail}`,
        url: it.href ? absoluteUrl(it.href) : null,
      })),
    });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="hoard.ics"',
        'Cache-Control': 'private, max-age=300',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (err) {
    console.error('[hoard] calendar feed failed:', err instanceof Error ? err.message : err);
    return new Response('Calendar unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
