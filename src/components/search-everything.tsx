'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, Loader2, Search } from 'lucide-react';

import { AddResultRow, useAddRows, type LibraryEntry } from '@/components/add-row';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { settle } from '@/lib/action-result';
import { resolveLink, searchEverything, type ResolveLinkResult } from '@/lib/actions/search';
import { CATEGORIES } from '@/lib/categories';
import type { LibraryMarks } from '@/lib/data-search';
import { createLatestGuard, shouldSearch } from '@/lib/search-nav';
import type { SectionOutcome } from '@/lib/search-everything';

// ───────────────────────────────────────────────────────────────────────────
//  Search everything (spec 2.5) and add by link (2.4). The panel searches
//  every visible section at once and groups the hits by section; the link
//  field resolves a pasted link to one add row. The /add page uses both
//  without the dialog.
// ───────────────────────────────────────────────────────────────────────────

const SEARCH_DEBOUNCE_MS = 400;

const markKeyOf = (slug: string, externalId: string) => `${slug}:${externalId}`;

/** The grouped results of one query (or nothing until two characters). */
export function SearchEverythingPanel({
  initialQuery = '',
  autoFocus = false,
}: {
  initialQuery?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [sections, setSections] = useState<SectionOutcome[] | null>(null);
  const [marks, setMarks] = useState<LibraryMarks>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = useAddRows();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guard = useRef(createLatestGuard());

  async function run(raw: string) {
    if (timer.current) clearTimeout(timer.current);
    const q = raw.trim();
    if (!shouldSearch(q)) return;
    const id = guard.current.next();
    setLoading(true);
    setError(null);
    try {
      const res = await searchEverything(q);
      if (!guard.current.isLatest(id)) return;
      setSections(res.sections);
      setMarks(res.marks);
      if (res.error) setError(res.error);
    } catch {
      if (!guard.current.isLatest(id)) return;
      setError('Search failed. Please try again.');
    }
    setLoading(false);
  }

  // Search the initial query (e.g. the /add page's title guess) once.
  useEffect(() => {
    if (shouldSearch(initialQuery)) void run(initialQuery);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (shouldSearch(value)) {
      timer.current = setTimeout(() => void run(value), SEARCH_DEBOUNCE_MS);
    } else {
      guard.current.next();
      setSections(null);
      setLoading(false);
    }
  }

  const anyHits = sections?.some((s) => s.state === 'ok' && s.results.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void run(query);
              }
            }}
            placeholder="Search every section…"
            aria-label="Search every section"
            className="pl-8 text-base sm:text-sm"
            autoComplete="off"
            autoFocus={autoFocus}
          />
        </div>
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Searching" />}
      </div>

      {error && <p className="text-sm text-rose-400 minimal:text-rose-700 organised:text-rose-700 minimal:dark:text-rose-400 organised:dark:text-rose-400">{error}</p>}

      {sections && !loading && !anyHits && sections.every((s) => s.state === 'ok') && (
        <p className="py-6 text-center text-sm text-muted-foreground">No results in any section.</p>
      )}

      {sections && (
        <div className="space-y-4" aria-busy={loading}>
          {sections.map((s) => {
            const cat = CATEGORIES[s.slug];
            if (s.state === 'ok' && s.results.length === 0) return null;
            return (
              <section key={s.slug} aria-label={cat.label} className="space-y-2">
                <h3 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat.label}
                  {s.state === 'timeout' && <span className="font-normal normal-case">timed out</span>}
                  {s.state === 'error' && <span className="font-normal normal-case text-rose-400 minimal:text-rose-700 organised:text-rose-700 minimal:dark:text-rose-400 organised:dark:text-rose-400">{s.message}</span>}
                </h3>
                {s.state === 'ok' && (
                  <div role="listbox" aria-label={`${cat.label} results`} className="space-y-2">
                    {s.results.map((result) => {
                      const key = markKeyOf(s.slug, result.externalId);
                      return (
                        <AddResultRow
                          key={key}
                          slug={s.slug}
                          result={result}
                          row={rows.rows[key]}
                          inLibrary={marks[key] ?? null}
                          onAdd={(status) => void rows.add(key, s.slug, result, status)}
                          onRate={(v) => {
                            const r = rows.rows[key];
                            if (r?.phase === 'rating') void rows.saveRating(key, r.activityId, v);
                          }}
                          onSkipRate={() => rows.setRow(key, { phase: 'done', rating: null })}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** What a resolved link shows: its add row, or the fallback search. */
export function LinkResult({
  resolution,
  fallbackQuery,
  sharedTitle,
}: {
  resolution: ResolveLinkResult;
  /** Used when the link gives no guess of its own. */
  fallbackQuery?: string;
  /** A title shared along with an unknown link wins over the page's <title>. */
  sharedTitle?: string;
}) {
  const rows = useAddRows();
  if (!resolution.ok) {
    return <p className="text-sm text-rose-400 minimal:text-rose-700 organised:text-rose-700 minimal:dark:text-rose-400 organised:dark:text-rose-400">{resolution.error}</p>;
  }
  const { slug, result } = resolution;
  if (slug && result) {
    const key = markKeyOf(slug, result.externalId);
    const mark: LibraryEntry | null = resolution.mark;
    return (
      <div role="listbox" aria-label="Found from the link">
        <AddResultRow
          slug={slug}
          result={result}
          row={rows.rows[key]}
          inLibrary={mark}
          note={CATEGORIES[slug].label}
          onAdd={(status) => void rows.add(key, slug, result, status)}
          onRate={(v) => {
            const r = rows.rows[key];
            if (r?.phase === 'rating') void rows.saveRating(key, r.activityId, v);
          }}
          onSkipRate={() => rows.setRow(key, { phase: 'done', rating: null })}
        />
      </div>
    );
  }
  const guess = (!resolution.provider && sharedTitle) || resolution.guess || fallbackQuery || '';
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-dashed border-border p-3 text-sm">
        <p className="font-medium">
          {resolution.provider ? 'Couldn’t find that title' : 'Couldn’t recognise that link'}
        </p>
        <p className="text-muted-foreground">
          {resolution.message ?? (guess ? 'Here is a search for the best guess at its title.' : 'Search for it instead.')}
        </p>
      </div>
      <SearchEverythingPanel key={guess} initialQuery={guess} />
    </div>
  );
}

/** "Paste a link": resolves it and shows the add row below. */
export function PasteLinkField({ initialUrl = '' }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [resolution, setResolution] = useState<ResolveLinkResult | null>(null);
  const guard = useRef(createLatestGuard());

  async function go(raw: string) {
    const u = raw.trim();
    if (!u) return;
    const id = guard.current.next();
    setBusy(true);
    // An error page or no network: the unreachable message, not nothing.
    const res = await settle(resolveLink(u));
    if (!guard.current.isLatest(id)) return;
    setResolution(res);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void go(url);
        }}
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text').trim();
              if (/^https?:\/\//i.test(pasted)) {
                e.preventDefault();
                setUrl(pasted);
                void go(pasted);
              }
            }}
            placeholder="Paste a link (TMDB, IMDb, AniList, Steam, Goodreads…)"
            aria-label="Paste a link"
            className="pl-8 text-base sm:text-sm"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-10 sm:h-9" disabled={busy || !url.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
        </Button>
      </form>
      {resolution && !busy && <LinkResult resolution={resolution} />}
    </div>
  );
}

/** The Search everything dialog (`/`, the user menu's Search, or the palette's Enter). */
export function SearchEverythingDialog({
  open,
  onOpenChange,
  initialQuery,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  /** Where focus goes on close (there is no trigger): see useFocusReturn. */
  onCloseAutoFocus?: (e: Event) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="bottom-0 top-auto max-h-[92dvh] max-w-full translate-y-0 gap-3 overflow-y-auto rounded-t-2xl border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-h-[90vh] sm:max-w-2xl sm:translate-y-[-50%] sm:gap-4 sm:border-b sm:p-6">
        <DialogHeader>
          <DialogTitle>Search everything</DialogTitle>
          <DialogDescription>Every section at once, or paste a link to add it.</DialogDescription>
        </DialogHeader>
        {/* Remounted per open (key), so each open starts fresh with its query. */}
        {open && (
          <div className="space-y-5">
            <PasteLinkField />
            <SearchEverythingPanel key={initialQuery} initialQuery={initialQuery} autoFocus />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
