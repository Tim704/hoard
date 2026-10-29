'use client';

// The details' "Seasons" section for TV titles (spec 3.3): watched episodes
// per season (+1, a typed count, "All", or per-episode ticks), a score per
// season, and a link to the show's season tier list (4.5). Every change is
// applied locally at once and saved after a short pause (rapid taps become
// one change, like the progress field); the server rewrites the show's
// progress as the sum over its seasons.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Plus, Rows3 } from 'lucide-react';
import { toast } from 'sonner';

import { Heading, type HeadingLevel } from '@/components/heading';
import { RatingInput } from '@/components/rating-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { settle } from '@/lib/action-result';
import { getSeasons, setSeasonRating, updateSeasonWatch } from '@/lib/actions/seasons';
import type { SeasonRow } from '@/lib/data-seasons';
import { formatYmd, formatYmShort, isYmd } from '@/lib/release';
import { applySeasonChange, watchedOf, type SeasonChange, type SeasonWatch } from '@/lib/seasons';
import { cn } from '@/lib/utils';

/** Quick taps are gathered for this long, then saved as one change. */
const TAP_BATCH_MS = 800;

/** Render with `key={activity.id}`, for TV titles only. */
export function TvSeasons({
  activityId,
  disabled,
  onLoaded,
  headingLevel = 3,
}: {
  activityId: string;
  disabled?: boolean;
  /** Told whether the show has seasons (then its progress is their sum). */
  onLoaded?: (hasSeasons: boolean) => void;
  /** Its "Seasons" heading's level (the title page's panels are h2). */
  headingLevel?: HeadingLevel;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<SeasonRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void settle(getSeasons(activityId)).then((res) => {
      if (!live) return;
      if (res.ok && res.seasons) {
        setRows(res.seasons);
        onLoaded?.(res.seasons.length > 0);
      } else setFailed(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per title
  }, [activityId]);

  // Saves run one at a time, in order; each sends the season's whole state.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, SeasonWatch>());

  const save = useCallback(
    (seasonId: string) => {
      const timer = timers.current.get(seasonId);
      if (timer) clearTimeout(timer);
      timers.current.delete(seasonId);
      const watch = pending.current.get(seasonId);
      if (!watch) return;
      pending.current.delete(seasonId);
      const change: SeasonChange =
        watch.episodesWatched.length > 0
          ? { kind: 'ticks', episodes: watch.episodesWatched }
          : { kind: 'set', value: watch.watchedEpisodes };
      queue.current = queue.current.then(async () => {
        const res = await settle(updateSeasonWatch(activityId, seasonId, change));
        if (!res.ok) {
          toast.error(res.error ?? 'Could not save the season.');
          const fresh = await getSeasons(activityId).catch(() => null);
          if (fresh?.ok && fresh.seasons) setRows(fresh.seasons);
          return;
        }
        router.refresh();
      });
    },
    [activityId, router],
  );

  // Closing the details mid-batch still saves the last change.
  useEffect(
    () => () => {
      for (const id of [...timers.current.keys()]) save(id);
    },
    [save],
  );

  function change(row: SeasonRow, c: SeasonChange) {
    const next = applySeasonChange(row, c, row.episodeCount);
    if (!next) return;
    setRows((rs) => rs?.map((r) => (r.seasonId === row.seasonId ? { ...r, ...next } : r)) ?? rs);
    pending.current.set(row.seasonId, next);
    const timer = timers.current.get(row.seasonId);
    if (timer) clearTimeout(timer);
    timers.current.set(row.seasonId, setTimeout(() => save(row.seasonId), TAP_BATCH_MS));
  }

  async function rate(row: SeasonRow, rating: number | null) {
    const prev = row.rating;
    setRows((rs) => rs?.map((r) => (r.seasonId === row.seasonId ? { ...r, rating } : r)) ?? rs);
    const res = await settle(setSeasonRating(activityId, row.seasonId, rating));
    if (!res.ok) {
      setRows((rs) => rs?.map((r) => (r.seasonId === row.seasonId ? { ...r, rating: prev } : r)) ?? rs);
      toast.error(res.error ?? 'Could not save the score.');
      return;
    }
    router.refresh();
  }

  const heading = (
    <Heading level={headingLevel} id={`seasons-${activityId}`} className="text-sm font-medium">
      Seasons
    </Heading>
  );
  if (failed) {
    return (
      <section aria-labelledby={`seasons-${activityId}`} className="space-y-2">
        {heading}
        <p className="text-xs text-muted-foreground">Could not load the seasons.</p>
      </section>
    );
  }
  if (!rows) return null;

  return (
    <section aria-labelledby={`seasons-${activityId}`} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading}
        {rows.length > 0 && (
          <Link
            href={`/tv/seasons/${encodeURIComponent(activityId)}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <Rows3 className="h-3.5 w-3.5" aria-hidden />
            Season tiers
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No season list yet. It arrives with the show&apos;s next details refresh.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((row) => (
            <SeasonLine
              key={row.seasonId}
              row={row}
              disabled={disabled}
              onChange={(c) => change(row, c)}
              onRate={(r) => void rate(row, r)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SeasonLine({
  row,
  disabled,
  onChange,
  onRate,
}: {
  row: SeasonRow;
  disabled?: boolean;
  onChange: (c: SeasonChange) => void;
  onRate: (rating: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const watched = watchedOf(row);
  const [draft, setDraft] = useState(String(watched));
  useEffect(() => setDraft(String(watched)), [watched]);

  const total = row.episodeCount;
  const inputId = `season-${row.seasonId}`;
  // Phones show the month and year only, so the row stays on one line.
  const aired = row.airDate && isYmd(row.airDate) ? { full: formatYmd(row.airDate), short: formatYmShort(row.airDate) } : null;

  function commitDraft() {
    const n = Number(draft.trim());
    if (draft.trim() === '' || !Number.isInteger(n) || n < 0) {
      setDraft(String(watched));
      return;
    }
    if (n !== watched) onChange({ kind: 'set', value: n });
  }

  // In count mode the first `watched` episodes count as ticked.
  const ticked = new Set(row.episodesWatched.length > 0 ? row.episodesWatched : range(watched));
  function toggle(ep: number) {
    const next = new Set(ticked);
    if (next.has(ep)) next.delete(ep);
    else next.add(ep);
    onChange({ kind: 'ticks', episodes: [...next] });
  }

  return (
    <li className="space-y-2 p-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="block truncate text-sm font-medium">
            {row.name}
          </label>
          {aired && (
            <p className="truncate text-xs text-muted-foreground">
              <span className="sm:hidden">{aired.short}</span>
              <span className="hidden sm:inline">{aired.full}</span>
            </p>
          )}
        </div>
        <Input
          id={inputId}
          value={draft}
          inputMode="numeric"
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
            }
          }}
          aria-label={`Watched episodes of ${row.name}`}
          // text-base on phones stops iOS zooming the page on focus (<16px does).
          className="h-9 w-14 shrink-0 text-base tabular-nums sm:text-sm"
        />
        <span className="shrink-0 text-sm text-muted-foreground">{total != null ? `/ ${total}` : 'eps'}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={disabled || (total != null && watched >= total)}
          onClick={() => onChange({ kind: 'inc' })}
          aria-label={`Add one episode of ${row.name}`}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />1
        </Button>
        {total != null && total > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={disabled || watched >= total}
            onClick={() => onChange({ kind: 'all' })}
          >
            All
          </Button>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} episodes and score of ${row.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      {open && (
        <div className="space-y-3 pl-1">
          {total != null && total > 0 && (
            <fieldset>
              <legend className="mb-1 text-xs text-muted-foreground">Episodes</legend>
              <div className="flex flex-wrap gap-1">
                {range(total).map((ep) => (
                  <button
                    key={ep}
                    type="button"
                    disabled={disabled}
                    aria-pressed={ticked.has(ep)}
                    aria-label={`Episode ${ep}`}
                    onClick={() => toggle(ep)}
                    className={cn(
                      'h-9 min-w-9 rounded-md border px-1 text-xs tabular-nums sm:h-8 sm:min-w-8',
                      ticked.has(ep)
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {ep}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Season score</span>
              {row.rating != null && (
                <button
                  type="button"
                  onClick={() => onRate(null)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <RatingInput value={row.rating} onChange={(v) => onRate(v)} />
          </div>
        </div>
      )}
    </li>
  );
}

const range = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i + 1);
