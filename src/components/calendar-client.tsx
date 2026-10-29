'use client';

// ───────────────────────────────────────────────────────────────────────────
//  /calendar (spec 5.6): a month grid (week starting on prefs.weekStart) and a
//  list of the coming 180 days. Items link to the title's details. Phones get
//  dots in the grid and the day's items below it on tap.
// ───────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarRange, ChevronLeft, ChevronRight, List, Rss } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { itemsByDay, KIND_LABEL, type CalendarItem, type CalendarKind } from '@/lib/calendar';
import { formatYmd } from '@/lib/release';
import { cn } from '@/lib/utils';
import { settingsHref } from '@/lib/settings-nav';

type View = 'grid' | 'list';
const isView = (v: unknown): v is View => v === 'grid' || v === 'list';

const KIND_STYLE: Record<CalendarKind, string> = {
  release: 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  episode: 'border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-200',
  airing: 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200',
  sequel: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
};
const KIND_DOT: Record<CalendarKind, string> = {
  release: 'bg-sky-500',
  episode: 'bg-violet-500',
  airing: 'bg-rose-500',
  sequel: 'bg-amber-500',
};

interface Props {
  items: CalendarItem[];
  weeks: string[][];
  weekdays: string[];
  today: string;
  month: string;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  currentMonth: string;
  listFrom: string;
  listTo: string;
  hasFeed: boolean;
}

function ItemRow({ item }: { item: CalendarItem }) {
  const content = (
    <div className="flex items-center gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-muted/50">
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', KIND_DOT[item.kind])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {KIND_LABEL[item.kind]} · {item.detail}
        </p>
      </div>
    </div>
  );
  return item.href ? <Link href={item.href}>{content}</Link> : content;
}

export function CalendarClient(props: Props) {
  const { items, weeks, weekdays, today, month } = props;
  const [view, setView] = usePersistentState<View>('hoard:calendar-view', 'grid', isView);
  const [picked, setPicked] = useState<string | null>(null);
  const byDay = useMemo(() => itemsByDay(items), [items]);

  const listDays = useMemo(
    () => [...byDay.entries()].filter(([day]) => day >= props.listFrom && day <= props.listTo),
    [byDay, props.listFrom, props.listTo],
  );
  const pickedItems = picked ? byDay.get(picked) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="View">
          <Button
            size="sm"
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
          >
            <CalendarRange className="mr-1.5 h-4 w-4" aria-hidden />
            Month
          </Button>
          <Button
            size="sm"
            variant={view === 'list' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            <List className="mr-1.5 h-4 w-4" aria-hidden />
            List
          </Button>
        </div>
        <Link
          href={settingsHref('sharing', 'calendar')}
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          <Rss className="h-3.5 w-3.5" aria-hidden />
          {props.hasFeed ? 'Calendar feed in Settings' : 'Subscribe in your calendar app'}
        </Link>
      </div>

      {view === 'grid' ? (
        <section className="space-y-3" aria-label={props.monthLabel}>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" asChild>
              <Link href={`/calendar?month=${props.prevMonth}`} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h2 className="min-w-0 flex-1 text-center text-lg font-semibold">{props.monthLabel}</h2>
            <Button variant="outline" size="icon" asChild>
              <Link href={`/calendar?month=${props.nextMonth}`} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {month !== props.currentMonth && (
            <p className="text-center">
              <Link href="/calendar" className="text-xs text-muted-foreground underline underline-offset-2">
                Back to this month
              </Link>
            </p>
          )}

          <div className="grid grid-cols-7 overflow-hidden rounded-md border border-border text-sm">
            {weekdays.map((d) => (
              <div key={d} className="border-b border-border bg-muted/40 px-1 py-1.5 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {weeks.flat().map((day) => {
              const dayItems = byDay.get(day) ?? [];
              const outside = day.slice(0, 7) !== month;
              const isToday = day === today;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setPicked(day === picked ? null : day)}
                  aria-label={`${formatYmd(day)}${dayItems.length ? `, ${dayItems.length} item${dayItems.length === 1 ? '' : 's'}` : ''}`}
                  aria-pressed={picked === day}
                  className={cn(
                    'flex min-h-14 flex-col gap-1 border-b border-r border-border p-1 text-left align-top transition-colors hover:bg-muted/40 sm:min-h-24',
                    outside && 'bg-muted/20 text-muted-foreground',
                    picked === day && 'bg-accent/60',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                      isToday && 'bg-primary font-semibold text-primary-foreground',
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {/* Phones: dots; wider screens: the first three titles. */}
                  <span className="flex flex-wrap gap-0.5 sm:hidden">
                    {dayItems.slice(0, 4).map((it) => (
                      <span key={it.uid} className={cn('h-1.5 w-1.5 rounded-full', KIND_DOT[it.kind])} />
                    ))}
                  </span>
                  <span className="hidden w-full min-w-0 space-y-0.5 sm:block">
                    {dayItems.slice(0, 3).map((it) => (
                      <span key={it.uid} className={cn('block truncate rounded border px-1 text-[11px] leading-tight', KIND_STYLE[it.kind])}>
                        {it.title}
                      </span>
                    ))}
                    {dayItems.length > 3 && (
                      <span className="block text-[11px] text-muted-foreground">+{dayItems.length - 3} more</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {(Object.keys(KIND_LABEL) as CalendarKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', KIND_DOT[k])} aria-hidden />
                {KIND_LABEL[k]}
              </span>
            ))}
          </div>

          {picked && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{formatYmd(picked)}</h3>
              {pickedItems.length ? (
                pickedItems.map((it) => <ItemRow key={it.uid} item={it} />)
              ) : (
                <p className="text-sm text-muted-foreground">Nothing on this day.</p>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-5" aria-label="Coming up">
          {listDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing dated in the next 180 days. Planned titles with a release date, shows you follow and airing
              anime appear here.
            </p>
          ) : (
            listDays.map(([day, dayItems]) => (
              <div key={day} className="space-y-2">
                <h3 className={cn('text-sm font-semibold', day === today && 'text-primary')}>
                  {formatYmd(day)}
                  {day === today && ' · Today'}
                </h3>
                <div className="space-y-1.5">
                  {dayItems.map((it) => (
                    <ItemRow key={it.uid} item={it} />
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}

