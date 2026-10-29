import { CalendarDays } from 'lucide-react';

import { CalendarClient } from '@/components/calendar-client';
import { addDays, monthBounds, monthGrid, monthKey, parseMonth, shiftMonth, weekdayLabels } from '@/lib/calendar';
import { getCalendarItems } from '@/lib/data-calendar';
import { getPrefs } from '@/lib/data-prefs';
import { effectiveTimeZone } from '@/lib/prefs';
import { todayYmd } from '@/lib/release';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Calendar · Hoard' };
export const dynamic = 'force-dynamic';

/**
 * The calendar (5.6): a month grid and a list of what's coming — planned
 * releases, next episodes, airing anime and announced sequels — in your time
 * zone, with the week starting on your chosen day.
 */
export default async function CalendarPage({ searchParams }: { searchParams: { month?: string } }) {
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  const today = todayYmd(effectiveTimeZone(prefs));
  const current = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const shown = parseMonth(searchParams.month) ?? current;

  const weeks = monthGrid(shown.year, shown.month, prefs.weekStart);
  const gridFirst = weeks[0][0];
  const gridLast = weeks[weeks.length - 1][6];
  // The list view always shows the next 180 days (plus the past week).
  const from = [gridFirst, addDays(today, -7)].sort()[0];
  const to = [gridLast, addDays(today, 180)].sort()[1];
  const items = await getCalendarItems(user.id, prefs, from, to, prefs.titleView);

  const prev = shiftMonth(shown.year, shown.month, -1);
  const next = shiftMonth(shown.year, shown.month, 1);
  const { first } = monthBounds(shown.year, shown.month);
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${first}T00:00:00Z`),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-[var(--page-pad)] py-4 sm:py-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarDays className="h-6 w-6 text-sky-500" aria-hidden />
          Calendar
        </h1>
        <p className="text-sm text-muted-foreground">
          Planned releases, next episodes of the shows you follow, airing anime and announced sequels of your
          franchises.
        </p>
      </header>
      <CalendarClient
        items={items}
        weeks={weeks}
        weekdays={weekdayLabels(prefs.weekStart)}
        today={today}
        month={monthKey(shown.year, shown.month)}
        monthLabel={monthLabel}
        prevMonth={monthKey(prev.year, prev.month)}
        nextMonth={monthKey(next.year, next.month)}
        currentMonth={monthKey(current.year, current.month)}
        listFrom={addDays(today, -7)}
        listTo={addDays(today, 180)}
        hasFeed={prefs.calendarToken !== null}
      />
    </div>
  );
}
