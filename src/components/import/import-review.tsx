'use client';

// The import review screen (spec 2.1), reused by every importer: it matches
// the rows (10 per call), lets the user check each match, pick an
// alternative, change the status or score, or skip it, then imports the
// ticked rows (20 per call, one call after another) and groups the new titles
// into franchises. `onDone` gets the tally.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ImageOff, Library, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  commitImportRows,
  finishImport,
  groupImportedFranchises,
  matchImportRows,
} from '@/lib/actions/import';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import {
  chunk,
  commitRowsFor,
  matchedItem,
  pendingItem,
  pickedInLibrary,
  summarise,
  type ImportSummary,
  type ReviewItem,
} from '@/lib/import/review';
import { matchKey } from '@/lib/import/match';
import { COMMIT_CHUNK, MATCH_CHUNK, type CommitRowOutcome, type ImportRow, type MatchConfidence } from '@/lib/import/types';
import { formatRating, parseRatingInput } from '@/lib/rating';
import { STATUSES, statusLabel, type Status } from '@/lib/status';
import type { NormalizedResult } from '@/lib/types';
import { cn } from '@/lib/utils';

export type { ImportSummary } from '@/lib/import/review';

interface ImportReviewProps {
  rows: ImportRow[];
  /** Called once the import (or the user's cancel before importing) is over. */
  onDone?: (summary: ImportSummary | null) => void;
}

type Phase =
  | { kind: 'matching'; done: number }
  | { kind: 'review' }
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'grouping'; done: number; total: number }
  | { kind: 'finished'; summary: ImportSummary };

type Filter = 'all' | 'check' | 'library';

const PAGE = 50;
const GROUP_CHUNK = 10;

const CONFIDENCE: Record<MatchConfidence, { label: string; className: string }> = {
  high: { label: 'Sure match', className: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  medium: { label: 'Likely match', className: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  low: { label: 'Check this', className: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  none: { label: 'No match', className: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300' },
};

export function ImportReview({ rows, onDone }: ImportReviewProps) {
  const [items, setItems] = useState<ReviewItem[]>(() => rows.map(pendingItem));
  const [phase, setPhase] = useState<Phase>({ kind: 'matching', done: 0 });
  const [updateExisting, setUpdateExisting] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const stopRef = useRef(false);

  // Match every row, MATCH_CHUNK at a time, strictly one call after another.
  useEffect(() => {
    let cancelled = false;
    stopRef.current = false;
    (async () => {
      const parts = chunk(rows.map((_, i) => i), MATCH_CHUNK);
      let done = 0;
      for (const part of parts) {
        if (cancelled || stopRef.current) break;
        const res = await matchImportRows(part.map((i) => rows[i])).catch(() => null);
        if (cancelled) return;
        setItems((prev) => {
          const next = [...prev];
          part.forEach((rowIndex, k) => {
            const match = res?.ok && res.matches?.[k];
            next[rowIndex] = matchedItem(
              next[rowIndex],
              match || {
                candidates: [],
                chosenIndex: -1,
                confidence: 'none',
                inLibrary: null,
                libraryByCandidate: [],
                message: res?.error ?? 'Matching failed. Try the import again later.',
              },
            );
          });
          return next;
        });
        done += part.length;
        setPhase({ kind: 'matching', done });
      }
      if (!cancelled) setPhase({ kind: 'review' });
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const update = useCallback((index: number, patch: Partial<ReviewItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }, []);

  const indexed = useMemo(() => items.map((item, index) => ({ item, index })), [items]);
  const shown = useMemo(
    () =>
      indexed.filter(({ item }) => {
        if (filter === 'check') return item.match && (item.match.confidence === 'low' || item.match.confidence === 'none');
        if (filter === 'library') return pickedInLibrary(item) !== null;
        return true;
      }),
    [indexed, filter],
  );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const pageItems = shown.slice(page * PAGE, page * PAGE + PAGE);

  const toImport = useMemo(() => commitRowsFor(items), [items]);
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, none: 0, library: 0, pending: 0 };
    for (const it of items) {
      if (it.match) c[it.match.confidence]++;
      else c.pending++;
      if (pickedInLibrary(it)) c.library++;
    }
    return c;
  }, [items]);

  const setAll = (include: boolean) =>
    setItems((prev) => prev.map((it) => ({ ...it, include: include && it.chosen >= 0 })));

  async function runImport() {
    const payload = toImport;
    if (payload.length === 0) return;
    const outcomes: CommitRowOutcome[] = [];
    setPhase({ kind: 'importing', done: 0, total: payload.length });
    for (const part of chunk(payload, COMMIT_CHUNK)) {
      const res = await commitImportRows(part, { updateExisting }).catch(() => null);
      if (res?.ok && res.outcomes) outcomes.push(...res.outcomes);
      else outcomes.push(...part.map(() => ({ outcome: 'failed' as const, error: res?.error ?? 'Import failed.' })));
      setPhase({ kind: 'importing', done: outcomes.length, total: payload.length });
    }

    // Franchise grouping once, for the titles that are new.
    const added = outcomes.filter((o) => o.outcome === 'added' && o.activityId).map((o) => o.activityId!);
    let grouped = 0;
    setPhase({ kind: 'grouping', done: 0, total: added.length });
    for (const part of chunk(added, GROUP_CHUNK)) {
      await groupImportedFranchises(part).catch(() => null);
      grouped += part.length;
      setPhase({ kind: 'grouping', done: grouped, total: added.length });
    }
    await finishImport().catch(() => null);

    const summary = summarise(items.length, outcomes);
    setPhase({ kind: 'finished', summary });
    if (summary.failed > 0) toast.error(`${summary.failed} title${summary.failed === 1 ? '' : 's'} could not be imported.`);
    else toast.success(`Imported ${summary.added + summary.updated} title${summary.added + summary.updated === 1 ? '' : 's'}.`);
    onDone?.(summary);
  }

  if (phase.kind === 'finished') return <FinishedCard summary={phase.summary} rows={items} />;

  const busy = phase.kind === 'importing' || phase.kind === 'grouping';
  const matching = phase.kind === 'matching';

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
        {matching ? (
          <ProgressLine label={`Matching ${phase.done} of ${items.length}…`} done={phase.done} total={items.length}>
            <Button type="button" size="sm" variant="outline" onClick={() => (stopRef.current = true)}>
              Stop and review
            </Button>
          </ProgressLine>
        ) : phase.kind === 'importing' ? (
          <ProgressLine label={`Importing ${phase.done} of ${phase.total}…`} done={phase.done} total={phase.total} />
        ) : phase.kind === 'grouping' ? (
          <ProgressLine label={`Grouping franchises ${phase.done}/${phase.total}…`} done={phase.done} total={phase.total} />
        ) : (
          <p className="text-sm">
            <span className="font-medium">{items.length} titles.</span>{' '}
            <span className="text-muted-foreground">
              {counts.high} sure, {counts.medium} likely, {counts.low} to check, {counts.none} without a match
              {counts.library > 0 && `, ${counts.library} already in your library`}
              {counts.pending > 0 && `, ${counts.pending} not matched (stopped early)`}.
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <FilterButton active={filter === 'all'} onClick={() => (setFilter('all'), setPage(0))}>
            All
          </FilterButton>
          <FilterButton active={filter === 'check'} onClick={() => (setFilter('check'), setPage(0))}>
            To check ({counts.low + counts.none})
          </FilterButton>
          <FilterButton active={filter === 'library'} onClick={() => (setFilter('library'), setPage(0))}>
            In library ({counts.library})
          </FilterButton>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setAll(true)}>
            Tick all
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setAll(false)}>
            Untick all
          </Button>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            checked={updateExisting}
            disabled={busy}
            onChange={(e) => setUpdateExisting(e.target.checked)}
          />
          <span>
            Update existing titles
            <span className="block text-xs text-muted-foreground">
              Titles already in your library get the imported status, score, dates, progress and tags. Off: they are
              left as they are.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={busy || matching || toImport.length === 0} onClick={() => void runImport()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Import {toImport.length}
          </Button>
          {!busy && (
            <Button type="button" variant="ghost" onClick={() => onDone?.(null)}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <ul className="space-y-2" aria-label="Titles to import">
        {pageItems.map(({ item, index }) => (
          <ReviewRow
            key={index}
            item={item}
            matching={matching}
            disabled={busy}
            onChange={(patch) => update(index, patch)}
          />
        ))}
        {pageItems.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing here.
          </li>
        )}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function ProgressLine({
  label,
  done,
  total,
  children,
}: {
  label: string;
  done: number;
  total: number;
  children?: React.ReactNode;
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {label}
        </p>
        {children}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? 'secondary' : 'outline'} aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  );
}

const SKIP = 'skip';

function ReviewRow({
  item,
  matching,
  disabled,
  onChange,
}: {
  item: ReviewItem;
  /** Matching still running (an unmatched row is waiting, not failed). */
  matching: boolean;
  disabled: boolean;
  onChange: (patch: Partial<ReviewItem>) => void;
}) {
  const { row, match } = item;
  const slug = row.category;
  const picked: NormalizedResult | undefined = match?.candidates[item.chosen];
  const inLibrary = pickedInLibrary(item);
  const [scoreText, setScoreText] = useState(item.rating == null ? '' : formatRating(item.rating));
  useEffect(() => setScoreText(item.rating == null ? '' : formatRating(item.rating)), [item.rating]);

  const fromFile = `${row.title}${row.year ? ` (${row.year})` : ''}`;
  const sameAsFile =
    !!picked && matchKey(picked.title) === matchKey(row.title) && (row.year == null || picked.year === row.year);
  const problem =
    match?.message ??
    (match?.confidence === 'none' ? "No match found. You can still add it from the section's Add button." : null);
  const commitScore = () => {
    const v = parseRatingInput(scoreText);
    if (scoreText.trim() === '') onChange({ rating: null });
    else if (v !== null) onChange({ rating: v });
    else setScoreText(item.rating == null ? '' : formatRating(item.rating));
  };

  return (
    <li
      className={cn(
        'flex gap-3 rounded-lg border border-border p-2.5 sm:p-3',
        item.include ? 'bg-card' : 'bg-muted/30 opacity-80',
      )}
    >
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
        checked={item.include}
        disabled={disabled || !picked}
        onChange={(e) => onChange({ include: e.target.checked })}
        aria-label={`Import ${picked?.title ?? row.title}`}
      />
      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted">
        {picked?.imageUrl ? (
          <Image src={picked.imageUrl} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-4 w-4" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="min-w-0 truncate text-sm font-medium">
              {picked ? picked.title : row.title}
              {picked?.year != null && <span className="ml-1 font-normal text-muted-foreground">({picked.year})</span>}
            </p>
            {match ? (
              <Badge variant="outline" className={cn('shrink-0 font-medium', CONFIDENCE[match.confidence].className)}>
                {CONFIDENCE[match.confidence].label}
              </Badge>
            ) : matching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Matching" />
            ) : (
              <Badge variant="outline" className="shrink-0 font-medium text-muted-foreground">
                Not matched
              </Badge>
            )}
            {inLibrary && (
              <Badge variant="outline" className="shrink-0 gap-1 font-medium">
                <Library className="h-3 w-3" aria-hidden />
                In library · {statusLabel(inLibrary.status, slug)}
              </Badge>
            )}
          </div>
          {picked?.subtitle && <p className="truncate text-xs text-muted-foreground">{picked.subtitle}</p>}
          <p className="truncate text-xs text-muted-foreground">
            {CATEGORIES[slug].singular}
            {sameAsFile ? '' : ` · from your file: ${fromFile}`}
          </p>
          {problem && (
            <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {problem}
            </p>
          )}
        </div>

        {match && (
          <div className="flex flex-wrap items-center gap-2">
            {match.candidates.length > 0 && (
              <Select
                value={item.chosen >= 0 ? String(item.chosen) : SKIP}
                disabled={disabled}
                onValueChange={(v) => {
                  const chosen = v === SKIP ? -1 : Number(v);
                  onChange({ chosen, include: chosen >= 0 });
                }}
              >
                <SelectTrigger className="h-8 w-full text-xs sm:w-56" aria-label="Matched title">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {match.candidates.map((c, i) => (
                    <SelectItem key={c.externalId + i} value={String(i)} className="text-xs">
                      {c.title}
                      {c.year != null ? ` (${c.year})` : ''}
                    </SelectItem>
                  ))}
                  <SelectItem value={SKIP} className="text-xs">
                    Skip this title
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            <StatusSelect slug={slug} value={item.status} disabled={disabled} onChange={(status) => onChange({ status })} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Score
              <Input
                value={scoreText}
                disabled={disabled}
                inputMode="decimal"
                placeholder="—"
                aria-label="Score out of 10"
                className="h-8 w-14 px-2 text-xs"
                onChange={(e) => setScoreText(e.target.value)}
                onBlur={commitScore}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitScore();
                }}
              />
              /10
            </label>
          </div>
        )}

        {(row.tags?.length || row.finishedOn || row.rewatchCount) && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {row.finishedOn && <span>Finished {row.finishedOn}</span>}
            {row.rewatchCount ? <span>· {row.rewatchCount}× again</span> : null}
            {row.tags?.map((t) => (
              <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-foreground/80">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function StatusSelect({
  slug,
  value,
  disabled,
  onChange,
}: {
  slug: CategorySlug;
  value: Status;
  disabled: boolean;
  onChange: (s: Status) => void;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={(v) => onChange(v as Status)}>
      <SelectTrigger className="h-8 w-32 text-xs" aria-label="Status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {statusLabel(s, slug)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FinishedCard({ summary, rows }: { summary: ImportSummary; rows: ReviewItem[] }) {
  const sections = [...new Set(rows.map((r) => r.row.category))];
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Import finished
      </p>
      <ul className="space-y-0.5 text-sm text-muted-foreground">
        <li>{summary.added} added</li>
        {summary.updated > 0 && <li>{summary.updated} updated</li>}
        {summary.unchanged > 0 && <li>{summary.unchanged} already in your library, left as they were</li>}
        {summary.skipped > 0 && <li>{summary.skipped} skipped</li>}
        {summary.failed > 0 && <li className="text-destructive">{summary.failed} could not be imported</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <Button key={s} asChild size="sm" variant="outline">
            <Link href={`/${s}`}>Open {CATEGORIES[s].label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
