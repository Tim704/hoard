'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, ImageOff, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { RatingStep } from '@/components/rating-step';
import { useDisplayTitle, useScoreFormat } from '@/components/prefs-provider';
import { addToList, updateActivity } from '@/lib/actions/media';
import type { CategorySlug } from '@/lib/categories';
import { libraryBadge } from '@/lib/search-nav';
import { addChoiceLabels, type Status } from '@/lib/status';
import type { NormalizedResult } from '@/lib/types';
import { cn } from '@/lib/utils';

// ───────────────────────────────────────────────────────────────────────────
//  The one "add row" every add surface shares (the Add dialog, /add by link,
//  Search everything, the ISBN lookup): cover, title, Done / Want, then the
//  score step after Done. `useAddRows` holds the per-row state and the add
//  and score calls; `AddResultRow` draws one row.
// ───────────────────────────────────────────────────────────────────────────

/** Per-result state once the user has acted on a row. */
export type RowState =
  | { phase: 'saving' }
  | { phase: 'rating'; activityId: string; saving: boolean }
  | { phase: 'done'; rating: number | null }
  | { phase: 'want' }
  | { phase: 'existing' };

export type LibraryEntry = { status: Status; rating: number | null };

/** The row state and add / score calls, keyed by a caller-chosen row key. */
export function useAddRows() {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const setRow = useCallback((key: string, state: RowState) => {
    setRows((prev) => ({ ...prev, [key]: state }));
  }, []);

  const clearRow = useCallback((key: string) => {
    setRows((prev) => {
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const reset = useCallback(() => setRows({}), []);

  async function add(key: string, slug: CategorySlug, result: NormalizedResult, status: 'COMPLETED' | 'PLANNED') {
    const labels = addChoiceLabels(slug);
    const title = titleOf({ ...result.fields, title: result.title });
    setRow(key, { phase: 'saving' });
    try {
      const res = await addToList(slug, result, status);
      if (!res.ok || !res.activityId) {
        clearRow(key);
        toast.error(res.error ?? 'Could not add that item.');
        return;
      }
      if (res.existing) {
        setRow(key, { phase: 'existing' });
        toast.info(`"${title}" is already in your library.`);
      } else if (status === 'COMPLETED') {
        setRow(key, { phase: 'rating', activityId: res.activityId, saving: false });
        toast.success(`Added "${title}" as ${labels.done}.`);
      } else {
        setRow(key, { phase: 'want' });
        toast.success(`Added "${title}" to Up next.`);
      }
      router.refresh();
    } catch {
      clearRow(key);
      toast.error('Could not add that item.');
    }
  }

  async function saveRating(key: string, activityId: string, rating: number) {
    setRow(key, { phase: 'rating', activityId, saving: true });
    try {
      const res = await updateActivity(activityId, { rating });
      if (res.ok) {
        setRow(key, { phase: 'done', rating });
        router.refresh();
        return;
      }
      toast.error(res.error ?? 'Could not save that rating.');
    } catch {
      toast.error('Could not save that rating.');
    }
    setRow(key, { phase: 'rating', activityId, saving: false });
  }

  return { rows, setRow, clearRow, reset, add, saveRating };
}

interface AddResultRowProps {
  slug: CategorySlug;
  result: NormalizedResult;
  row?: RowState;
  /** Already in the user's library (shows the badge instead of the buttons). */
  inLibrary?: LibraryEntry | null;
  /** DOM id (listbox option id) and highlight / selection for keyboard use. */
  id?: string;
  highlighted?: boolean;
  /** "Select several": a checkbox replaces the buttons. */
  multi?: { picked: boolean; disabled: boolean; onToggle: () => void };
  /** A small label under the title (e.g. the section, when it isn't obvious). */
  note?: string;
  onAdd: (status: 'COMPLETED' | 'PLANNED') => void;
  onRate: (rating: number) => void;
  onSkipRate: () => void;
}

export function AddResultRow({
  slug,
  result,
  row,
  inLibrary,
  id,
  highlighted = false,
  multi,
  note,
  onAdd,
  onRate,
  onSkipRate,
}: AddResultRowProps) {
  const { score, format: scoreFormat } = useScoreFormat();
  const titleOf = useDisplayTitle();
  // AniList hits carry their title variants in `fields` (spec 4.9).
  const title = titleOf({ ...result.fields, title: result.title });
  const labels = addChoiceLabels(slug);
  const busy = row?.phase === 'saving';
  const selectable = !!multi && !inLibrary && !row;

  return (
    <div
      id={id}
      role="option"
      aria-selected={multi ? multi.picked : highlighted}
      data-external-id={result.externalId}
      onClick={
        selectable
          ? (e) => {
              if ((e.target as HTMLElement).closest('input')) return;
              multi.onToggle();
            }
          : undefined
      }
      className={cn(
        'flex items-center gap-3 rounded-md border border-border p-2',
        highlighted && 'border-primary bg-accent/50',
        selectable && 'cursor-pointer',
        multi?.picked && 'border-primary/70 bg-primary/5',
      )}
    >
      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted">
        {result.imageUrl ? (
          <Image src={result.imageUrl} alt={title} fill sizes="44px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-4 w-4" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={title}>
          {title}
          {result.year != null && (
            <span className="ml-1 font-normal text-muted-foreground">({result.year})</span>
          )}
        </p>
        {result.subtitle && <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>}
        {note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
        {row?.phase === 'rating' && (
          <div className="mt-1.5">
            <RatingStep autoFocus disabled={row.saving} onSave={onRate} onSkip={onSkipRate} />
          </div>
        )}
      </div>
      {row?.phase === 'done' ? (
        <ConfirmedLabel>
          {labels.done}
          {row.rating !== null && ` ${score(row.rating)}`}
        </ConfirmedLabel>
      ) : row?.phase === 'want' ? (
        <ConfirmedLabel>In Up next</ConfirmedLabel>
      ) : row?.phase === 'existing' || (inLibrary && !row) ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {inLibrary ? libraryBadge(inLibrary, slug, scoreFormat) : 'In library'}
        </span>
      ) : row?.phase === 'rating' ? null : multi ? (
        busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-label="Adding" />
        ) : (
          <input
            type="checkbox"
            checked={multi.picked}
            disabled={multi.disabled}
            onChange={multi.onToggle}
            aria-label={`Select ${title}`}
            className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
          />
        )
      ) : (
        <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onAdd('COMPLETED')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span className="ml-1.5">{labels.done}</span>
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onAdd('PLANNED')}>
            <Plus className="h-4 w-4" />
            <span className="ml-1.5">{labels.want}</span>
          </Button>
        </div>
      )}
    </div>
  );
}

export function ConfirmedLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-500">
      <Check className="h-4 w-4" aria-hidden />
      {children}
    </span>
  );
}
