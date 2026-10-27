'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, ImageOff, Loader2, Plus, Search } from 'lucide-react';
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
import { RatingInput } from '@/components/rating-input';
import { addToList, searchMedia, updateActivity } from '@/lib/actions/media';
import type { CategorySlug } from '@/lib/categories';
import { formatRating } from '@/lib/rating';
import type { NormalizedResult } from '@/lib/types';

interface SearchDialogProps {
  slug: CategorySlug;
  singular: string;
  /** Extra classes for the trigger button (lets the toolbar size/order it). */
  triggerClassName?: string;
}

/**
 * Provider-search dialog. Lets the user search the external provider for the
 * category and add results to their list. Supports adding multiple before close.
 * On phones the dialog docks to the bottom of the screen as a sheet.
 */
export function SearchDialog({ slug, singular, triggerClassName }: SearchDialogProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NormalizedResult[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [searching, startSearch] = useTransition();
  // Tracks the externalId currently being added so we can disable just that row.
  const [addingId, setAddingId] = useState<string | null>(null);
  // Per-result added state, keyed by externalId, so each row can be rated inline.
  const [added, setAdded] = useState<
    Map<string, { activityId: string; rating: number | null }>
  >(new Map());

  function runSearch() {
    const q = query.trim();
    if (!q) return;
    setError(null);
    startSearch(async () => {
      try {
        const response = await searchMedia(slug, q);
        setResults(response.results);
        setSource(response.source);
        setError(response.error ?? null);
        setSearched(true);
      } catch {
        setResults([]);
        setError('Search failed. Please try again.');
        setSearched(true);
      }
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch();
  }

  async function add(result: NormalizedResult) {
    setAddingId(result.externalId);
    try {
      const res = await addToList(slug, result);
      if (res.ok && res.activityId) {
        // Record the activity id so this row swaps to an inline rating control.
        setAdded((prev) => {
          const next = new Map(prev);
          next.set(result.externalId, { activityId: res.activityId!, rating: null });
          return next;
        });
        toast.success(`Added "${result.title}" to your ${singular.toLowerCase()} list.`);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not add that item.');
      }
    } catch {
      toast.error('Could not add that item.');
    } finally {
      setAddingId(null);
    }
  }

  async function rate(result: NormalizedResult, activityId: string, rating: number) {
    // Optimistically reflect the selected rating on the row.
    setAdded((prev) => {
      const next = new Map(prev);
      next.set(result.externalId, { activityId, rating });
      return next;
    });
    try {
      const res = await updateActivity(activityId, { rating });
      if (res.ok) {
        toast.success(`Rated "${result.title}" ${formatRating(rating)}/10.`);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save that rating.');
      }
    } catch {
      toast.error('Could not save that rating.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            Search the provider and add results to your list.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search for a ${singular.toLowerCase()}…`}
            // text-base on phones stops iOS zooming the page on focus (<16px does).
            className="text-base sm:text-sm"
            autoFocus
          />
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Search</span>
          </Button>
        </form>

        {error && (
          <p className="text-sm text-rose-400">{error}</p>
        )}

        <div className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-[55vh]">
          {searching && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Searching{source ? ` ${source}` : ''}…
            </div>
          )}

          {!searching && searched && results.length === 0 && !error && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </p>
          )}

          {!searching &&
            results.map((result) => {
              const entry = added.get(result.externalId);
              return (
                <div
                  key={result.externalId}
                  className="flex items-center gap-3 rounded-md border border-border p-2"
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
                    {entry && (
                      // Added → let the user rate it right here, no detail dialog.
                      <div className="mt-1.5">
                        <RatingInput
                          value={entry.rating}
                          onChange={(v) => rate(result, entry.activityId, v)}
                        />
                      </div>
                    )}
                  </div>
                  {entry ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-500">
                      <Check className="h-4 w-4" aria-hidden />
                      Added
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={addingId === result.externalId}
                      onClick={() => add(result)}
                    >
                      {addingId === result.externalId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      <span className="ml-1.5">Add</span>
                    </Button>
                  )}
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
