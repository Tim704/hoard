'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ListChecks, Loader2, PencilLine, Plus, ScanBarcode } from 'lucide-react';
import { toast } from 'sonner';

import { AddResultRow, useAddRows } from '@/components/add-row';
import { IsbnLookup } from '@/components/isbn-lookup';
import { LinkResult } from '@/components/search-everything';

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
import { ManualFields } from '@/components/manual-fields';
import { settle } from '@/lib/action-result';
import { addManualEntry, addToList, searchMedia } from '@/lib/actions/media';
import { resolveLink, type ResolveLinkResult } from '@/lib/actions/search';
import type { CategorySlug } from '@/lib/categories';
import { parseManualInput, type ManualInput } from '@/lib/manual';
import { cn } from '@/lib/utils';
import { createLatestGuard, nextHighlight, shouldSearch } from '@/lib/search-nav';
import { addChoiceLabels, type Status } from '@/lib/status';
import type { NormalizedResult } from '@/lib/types';

interface SearchDialogProps {
  slug: CategorySlug;
  singular: string;
  /** Titles already in the user's library, keyed by provider externalId. */
  library: Record<string, { status: Status; rating: number | null }>;
  /** Extra classes for the default trigger button. */
  triggerClassName?: string;
  /**
   * A trigger of your own instead of the default "+ Add <singular>" button
   * (the section toolbar's, with a tooltip); it must forward its ref and
   * props, like a Button or a TooltipTrigger with `asChild`.
   */
  trigger?: React.ReactElement;
}

/** Search as you type waits this long after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 350;

/** A pasted link instead of a search (spec 2.4). */
const isLink = (q: string) => /^https?:\/\/\S+$/i.test(q.trim());

/**
 * Provider-search dialog. Searches as you type, ↑/↓ highlights a result and
 * Enter jumps to its two choices (done / want to). Supports adding several
 * titles before closing; "Select several" ticks results (across searches) and
 * adds them in one go (spec 1.8). "Add it yourself" opens a form for titles
 * the provider doesn't know (spec 1.5).
 * Pasting a link instead looks that title up (spec 2.4); Books also take an
 * ISBN, typed or scanned (2.9). The result rows are the shared AddResultRow.
 * On phones the dialog docks to the bottom of the screen as a sheet.
 */
export function SearchDialog({
  slug,
  singular,
  library,
  triggerClassName,
  trigger,
}: SearchDialogProps) {
  const router = useRouter();
  const labels = addChoiceLabels(slug);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NormalizedResult[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const { rows, setRow, clearRow, reset: resetRows, add: addRow, saveRating: saveRowRating } = useAddRows();
  const [link, setLink] = useState<ResolveLinkResult | null>(null);
  const [showIsbn, setShowIsbn] = useState(false);
  // "Select several": the ticked results, keyed by externalId, kept across searches.
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<Record<string, NormalizedResult>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  // "Add it yourself": the manual entry form replaces the search view.
  const [view, setView] = useState<'search' | 'manual'>('search');
  const [manual, setManual] = useState<ManualInput>({});
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState(false);

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
    resetRows();
    setLink(null);
    setShowIsbn(false);
    setMulti(false);
    setPicked({});
    setBulk(null);
    setView('search');
    setManual({});
    setManualError(null);
    setManualBusy(false);
  }

  function onOpenChange(next: boolean) {
    // Closing mid-way through "Add N" would hide its progress; wait for it.
    if (!next && (bulk || manualBusy)) return;
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
    if (isLink(q)) {
      try {
        const res = await resolveLink(q);
        if (!guard.current.isLatest(id)) return;
        setLink(res);
      } catch {
        if (!guard.current.isLatest(id)) return;
        setLink({ ok: false, error: 'Could not read that link.' });
      }
      setResults([]);
      setSearched(true);
      setLoading(false);
      return;
    }
    setLink(null);
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
      setLink(null);
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
        if (library[target.externalId] || rows[target.externalId]) return;
        if (multi) togglePick(target);
        else focusChoices(target);
      } else {
        void runSearch(query);
      }
    }
  }

  const add = (result: NormalizedResult, status: 'COMPLETED' | 'PLANNED') =>
    addRow(result.externalId, slug, result, status);

  function togglePick(result: NormalizedResult) {
    if (bulk) return;
    setPicked((prev) => {
      const { [result.externalId]: had, ...rest } = prev;
      return had ? rest : { ...prev, [result.externalId]: result };
    });
  }

  /**
   * Add every ticked title, one after another (each is a normal add, so
   * franchise grouping and events behave exactly as for a single add). Done
   * titles get no score here: they wait in the tier list's "Score these". Failures stay
   * ticked so they can be retried.
   */
  async function addPicked(status: 'COMPLETED' | 'PLANNED') {
    const list = Object.values(picked);
    if (list.length === 0 || bulk) return;
    let added = 0;
    let already = 0;
    const failed: Record<string, NormalizedResult> = {};
    setBulk({ done: 0, total: list.length });
    for (const [i, result] of list.entries()) {
      const key = result.externalId;
      setRow(key, { phase: 'saving' });
      try {
        const res = await settle(addToList(slug, result, status));
        if (!res.ok || !res.activityId) {
          failed[key] = result;
          clearRow(key);
        } else if (res.existing) {
          already++;
          setRow(key, { phase: 'existing' });
        } else {
          added++;
          setRow(key, status === 'COMPLETED' ? { phase: 'done', rating: null } : { phase: 'want' });
        }
      } catch {
        failed[key] = result;
        clearRow(key);
      }
      setBulk({ done: i + 1, total: list.length });
    }
    setBulk(null);
    setPicked(failed);
    router.refresh();

    const titles = (n: number) => `${n} ${n === 1 ? 'title' : 'titles'}`;
    const extra = already > 0 ? ` ${titles(already)} already in your library.` : '';
    if (added > 0) {
      toast.success(
        status === 'COMPLETED'
          ? `Added ${titles(added)} as ${labels.done}. Score them from “Score these” on the tier list.${extra}`
          : `Added ${titles(added)} to Up next.${extra}`,
      );
    } else if (already > 0) {
      toast.info(extra.trim());
    }
    const failures = Object.keys(failed).length;
    if (failures > 0) toast.error(`${titles(failures)} could not be added. They are still selected.`);
  }

  function openManual() {
    setManual({ title: query.trim() });
    setManualError(null);
    setView('manual');
  }

  async function submitManual(status: 'COMPLETED' | 'PLANNED') {
    const parsed = parseManualInput(slug, manual);
    if (!parsed.ok) {
      setManualError(parsed.error);
      return;
    }
    const title = String(parsed.fields.title);
    setManualBusy(true);
    setManualError(null);
    try {
      const res = await settle(addManualEntry(slug, manual, status));
      if (!res.ok) {
        setManualError(res.error ?? 'Could not add that.');
        return;
      }
      toast.success(
        status === 'COMPLETED' ? `Added “${title}” as ${labels.done}.` : `Added “${title}” to Up next.`,
      );
      router.refresh();
      setManual({});
      setView('search');
    } catch {
      setManualError('Could not add that.');
    } finally {
      setManualBusy(false);
    }
  }

  const activeId = highlight >= 0 ? `add-option-${highlight}` : undefined;

  const pickedCount = Object.keys(picked).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className={triggerClassName}>
            <Plus className="mr-2 h-4 w-4" />
            Add {singular}
          </Button>
        )}
      </DialogTrigger>
      {/* Mobile: dock to the bottom edge as a sheet (full width, rounded top,
          safe-area padding); sm+ restores the centered dialog. */}
      <DialogContent className="bottom-0 top-auto max-h-[92dvh] max-w-full translate-y-0 gap-3 rounded-t-2xl border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto sm:bottom-auto sm:top-[50%] sm:max-h-[90vh] sm:max-w-lg sm:translate-y-[-50%] sm:gap-4 sm:border-b sm:p-6">
        <DialogHeader>
          <DialogTitle>Add {singular}</DialogTitle>
          <DialogDescription>
            {view === 'manual'
              ? `Add a ${singular.toLowerCase()} by hand. Only the title is required.`
              : multi
                ? 'Tick the results to add, then add them all at once.'
                : 'Start typing to search. Use ↑/↓ and Enter to pick a result.'}
          </DialogDescription>
        </DialogHeader>

        {view === 'manual' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitManual('COMPLETED');
            }}
          >
            <ManualFields
              slug={slug}
              value={manual}
              onChange={setManual}
              disabled={manualBusy}
              idPrefix={`manual-add-${slug}`}
            />
            {manualError && (
              <p className="text-sm text-rose-500" role="alert">
                {manualError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={manualBusy}
                onClick={() => setView('search')}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to search
              </Button>
              <div className="ml-auto flex gap-2">
                <Button type="submit" size="sm" variant="secondary" disabled={manualBusy}>
                  {manualBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span className="ml-1.5">{labels.done}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={manualBusy}
                  onClick={() => void submitManual('PLANNED')}
                >
                  <Plus className="h-4 w-4" />
                  <span className="ml-1.5">{labels.want}</span>
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={`Search for a ${singular.toLowerCase()} or paste a link…`}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={multi}
                disabled={!!bulk}
                onClick={() => {
                  setMulti((m) => !m);
                  setPicked({});
                }}
                className={cn('h-10 shrink-0 sm:h-9', multi && 'bg-accent text-accent-foreground')}
                title="Select several"
              >
                <ListChecks className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">Select several</span>
                <span className="sr-only sm:hidden">Select several</span>
              </Button>
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            {slug === 'books' && (
              <div className="space-y-2">
                {!showIsbn ? (
                  <button
                    type="button"
                    onClick={() => setShowIsbn(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    <ScanBarcode className="h-4 w-4" aria-hidden />
                    Scan a barcode or type an ISBN
                  </button>
                ) : (
                  <IsbnLookup library={library} />
                )}
              </div>
            )}

            {link && !loading && <LinkResult resolution={link} />}

            <div
              ref={listRef}
              id="add-results"
              role="listbox"
              aria-label="Search results"
              aria-multiselectable={multi || undefined}
              className="max-h-[50dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-[50vh]"
            >
              {loading && results.length === 0 && (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Searching{source ? ` ${source}` : ''}…
                </div>
              )}

              {!loading && searched && results.length === 0 && !error && !link && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No results found.
                </p>
              )}

              {results.map((result, index) => {
                const key = result.externalId;
                const row = rows[key];
                return (
                  <AddResultRow
                    key={key}
                    id={`add-option-${index}`}
                    slug={slug}
                    result={result}
                    row={row}
                    inLibrary={library[key] ?? null}
                    highlighted={index === highlight}
                    multi={
                      multi
                        ? { picked: !!picked[key], disabled: !!bulk, onToggle: () => togglePick(result) }
                        : undefined
                    }
                    onAdd={(status) => void add(result, status)}
                    onRate={(v) => {
                      if (row?.phase === 'rating') void saveRowRating(key, row.activityId, v);
                    }}
                    onSkipRate={() => setRow(key, { phase: 'done', rating: null })}
                  />
                );
              })}
            </div>

            {/* Footer, sticky because the dialog itself scrolls on phones. It
                reaches over the dialog's bottom padding (negative margin, same
                padding back) so no result shows through beneath it. */}
            <div className="sticky bottom-0 z-10 -mx-4 -mb-[max(1rem,env(safe-area-inset-bottom))] grid gap-3 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
              {multi && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
                  <span className="text-sm text-muted-foreground" aria-live="polite">
                    {bulk
                      ? `Adding ${Math.min(bulk.done + 1, bulk.total)} of ${bulk.total}…`
                      : pickedCount === 0
                        ? 'Nothing selected yet.'
                        : `${pickedCount} selected`}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pickedCount === 0 || !!bulk}
                      onClick={() => void addPicked('COMPLETED')}
                    >
                      {bulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      <span className="ml-1.5">
                        Add {pickedCount || ''} as {labels.done}
                      </span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pickedCount === 0 || !!bulk}
                      onClick={() => void addPicked('PLANNED')}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="ml-1.5">Add {pickedCount || ''} to Up next</span>
                    </Button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={openManual}
                disabled={!!bulk}
                className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden />
                Can’t find it? Add it yourself
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
