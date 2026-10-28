'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, ImageOff, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RatingStep } from '@/components/rating-step';
import { addToList, searchMedia, updateActivity } from '@/lib/actions/media';
import type { CategorySlug } from '@/lib/categories';
import { cn } from '@/lib/utils';
import { useScoreFormat } from '@/components/prefs-provider';
import {
  createLatestGuard,
  libraryBadge,
  nextHighlight,
  shouldSearch,
} from '@/lib/search-nav';
import { addChoiceLabels, type Status } from '@/lib/status';
import type { NormalizedResult } from '@/lib/types';

interface SearchDialogProps {
  slug: CategorySlug;
  singular: string;
  /** Titles already in the user's library, keyed by provider externalId. */
  library: Record<string, { status: Status; rating: number | null }>;
  /** Extra classes for the trigger button (lets the toolbar size/order it). */
  triggerClassName?: string;
}

/** Search as you type waits this long after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 350;

/** Per-result state once the user has acted on a row. */
type RowState =
  | { phase: 'saving' }
  | { phase: 'rating'; activityId: string; saving: boolean }
  | { phase: 'done'; rating: number | null }
  | { phase: 'want' }
  | { phase: 'existing' };

/**
 * Provider-search dialog. Searches as you type, ↑/↓ highlights a result and
 * Enter jumps to its two choices (done / want to). Supports adding several
 * titles before closing.
 * On phones the dialog docks to the bottom of the screen as a sheet.
 */
export function SearchDialog({
  slug,
  singular,
  library,
  triggerClassName,
}: SearchDialogProps) {
  const router = useRouter();
  const { score, format: scoreFormat } = useScoreFormat();
  const labels = addChoiceLabels(slug);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NormalizedResult[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guard = useRef(createLatestGuard());
  const listRef = useRef<HTMLDivElement>(null);

  function cancelPending() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  // Never leave a timer running after unmount.
  useEffect(() => cancelPending, []);

  function reset() {
    cancelPending();
    guard.current.next(); // drop any in-flight response
    setQuery('');
    setResults([]);
    setSource(null);
    setError(null);
    setSearched(false);
    setLoading(false);
    setHighlight(-1);
    setRows({});
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function runSearch(raw: string) {
    cancelPending();
    const q = raw.trim();
    if (!q) return;
    const id = guard.current.next();
    setError(null);
    setLoading(true);
    try {
      const response = await searchMedia(slug, q);
      if (!guard.current.isLatest(id)) return;
      setResults(response.results);
      setSource(response.source);
      setError(response.error ?? null);
    } catch {
      if (!guard.current.isLatest(id)) return;
      setResults([]);
      setError('Search failed. Please try again.');
    }
    setHighlight(-1);
    setSearched(true);
    setLoading(false);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    cancelPending();
    if (shouldSearch(value)) {
      timer.current = setTimeout(() => void runSearch(value), SEARCH_DEBOUNCE_MS);
    } else {
      // Too short to search: drop any in-flight response and stale results.
      guard.current.next();
      setResults([]);
      setError(null);
      setSearched(false);
      setLoading(false);
      setHighlight(-1);
    }
  }

  function focusChoices(result: NormalizedResult) {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-external-id="${CSS.escape(result.externalId)}"]`,
    );
    row?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = nextHighlight(highlight, e.key === 'ArrowDown' ? 1 : -1, results.length);
      setHighlight(next);
      requestAnimationFrame(() =>
        document.getElementById(`add-option-${next}`)?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = highlight >= 0 ? results[highlight] : undefined;
      if (target) {
        if (!library[target.externalId] && !rows[target.externalId]) focusChoices(target);
      } else {
        void runSearch(query);
      }
    }
  }

  function setRow(id: string, state: RowState) {
    setRows((prev) => ({ ...prev, [id]: state }));
  }

  function clearRow(id: string) {
    setRows((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function add(result: NormalizedResult, status: 'COMPLETED' | 'PLANNED') {
    const key = result.externalId;
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
        toast.info(`"${result.title}" is already in your library.`);
      } else if (status === 'COMPLETED') {
        setRow(key, { phase: 'rating', activityId: res.activityId, saving: false });
        toast.success(`Added "${result.title}" as ${labels.done}.`);
      } else {
        setRow(key, { phase: 'want' });
        toast.success(`Added "${result.title}" to Up next.`);
      }
      router.refresh();
    } catch {
      clearRow(key);
      toast.error('Could not add that item.');
    }
  }

  async function saveRating(result: NormalizedResult, activityId: string, rating: number) {
    const key = result.externalId;
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

  const activeId = highlight >= 0 ? `add-option-${highlight}` : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className={triggerClassName}>
          <Plus className="mr-2 h-4 w-4" />
          Add {singular}
        </Button>
      </DialogTrigger>
      {/* Mobile: dock to the bottom edge as a sheet (full width, rounded top,
          safe-area padding); sm+ restores the centered dialog. */}
      <DialogContent className="bottom-0 top-auto max-h-[92dvh] max-w-full translate-y-0 gap-3 rounded-t-2xl border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-h-none sm:max-w-lg sm:translate-y-[-50%] sm:gap-4 sm:border-b sm:p-6">
        <DialogHeader>
          <DialogTitle>Add {singular}</DialogTitle>
          <DialogDescription>
            Start typing to search. Use ↑/↓ and Enter to pick a result.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={`Search for a ${singular.toLowerCase()}…`}
            // text-base on phones stops iOS zooming the page on focus (<16px does).
            className="text-base sm:text-sm"
            role="combobox"
            aria-label={`Search for a ${singular.toLowerCase()}`}
            aria-expanded={results.length > 0}
            aria-controls="add-results"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            autoFocus
          />
          {loading && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Searching" />
          )}
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div
          ref={listRef}
          id="add-results"
          role="listbox"
          aria-label="Search results"
          className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-[55vh]"
        >
          {loading && results.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Searching{source ? ` ${source}` : ''}…
            </div>
          )}

          {!loading && searched && results.length === 0 && !error && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </p>
          )}

          {results.map((result, index) => {
            const key = result.externalId;
            const row = rows[key];
            const inLibrary = library[key];
            const busy = row?.phase === 'saving';
            return (
              <div
                key={key}
                id={`add-option-${index}`}
                role="option"
                aria-selected={index === highlight}
                data-external-id={key}
                className={cn(
                  'flex items-center gap-3 rounded-md border border-border p-2',
                  index === highlight && 'border-primary bg-accent/50',
                )}
              >
                <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted">
                  {result.imageUrl ? (
                    <Image
                      src={result.imageUrl}
                      alt={result.title}
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-4 w-4" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={result.title}>
                    {result.title}
                    {result.year != null && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({result.year})
                      </span>
                    )}
                  </p>
                  {result.subtitle && (
                    <p className="truncate text-xs text-muted-foreground">
                      {result.subtitle}
                    </p>
                  )}
                  {row?.phase === 'rating' && (
                    <div className="mt-1.5">
                      <RatingStep
                        autoFocus
                        disabled={row.saving}
                        onSave={(v) => void saveRating(result, row.activityId, v)}
                        onSkip={() => setRow(key, { phase: 'done', rating: null })}
                      />
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
                ) : row?.phase === 'rating' ? null : (
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void add(result, 'COMPLETED')}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      <span className="ml-1.5">{labels.done}</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void add(result, 'PLANNED')}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="ml-1.5">{labels.want}</span>
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmedLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-500">
      <Check className="h-4 w-4" aria-hidden />
      {children}
    </span>
  );
}
