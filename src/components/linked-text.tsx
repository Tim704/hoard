'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Linked notes (spec 8.5) in the browser:
//  - `LinkedText` shows notes or a review with each `[[Title]]` as a link to
//    that title's details (the existing ?open= support); a target that isn't
//    in the library stays text with a dotted underline.
//  - `LinkTextarea` is a Textarea with autocomplete after `[[`.
//  - `MentionedIn` lists the titles whose notes or reviews link here.
//  Rules live in src/lib/linked-notes.ts. The library index (the palette's,
//  from `libraryIndex`) is fetched once and shared, keyed by the user.
// ───────────────────────────────────────────────────────────────────────────

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2 } from 'lucide-react';

import { useGlobalSearch } from '@/components/global-search';
import { useDisplayTitle } from '@/components/prefs-provider';
import { Textarea } from '@/components/ui/textarea';
import { getMentionedIn } from '@/lib/actions/linked-notes';
import { libraryIndex } from '@/lib/actions/search';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import type { LibraryIndexEntry } from '@/lib/data-search';
import { rankFuzzy } from '@/lib/fuzzy';
import { completeLink, linkQueryAt, parseNoteLinks, resolveNoteLink, type LinkSource } from '@/lib/linked-notes';
import { titleVariants } from '@/lib/title';
import { cn } from '@/lib/utils';

// ── The shared library index ────────────────────────────────────────────────

const FRESH_MS = 30_000;
let cache: { userId: string; entries: LibraryIndexEntry[]; at: number } | null = null;
let inflight: { userId: string; promise: Promise<LibraryIndexEntry[]> } | null = null;

function loadIndex(userId: string): Promise<LibraryIndexEntry[]> {
  if (inflight?.userId === userId) return inflight.promise;
  const promise = libraryIndex()
    .then((entries) => {
      cache = { userId, entries, at: Date.now() };
      return entries;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { userId, promise };
  return promise;
}

/** The user's library index once loaded (null until then, or when not `enabled`). */
export function useLibraryIndex(enabled = true): LibraryIndexEntry[] | null {
  const { userId } = useGlobalSearch();
  const cached = userId && cache?.userId === userId ? cache.entries : null;
  const [entries, setEntries] = useState<LibraryIndexEntry[] | null>(cached);
  useEffect(() => {
    if (!enabled || !userId) return;
    let live = true;
    if (cache?.userId === userId) setEntries(cache.entries);
    if (cache?.userId === userId && Date.now() - cache.at < FRESH_MS) return;
    loadIndex(userId)
      .then((fresh) => live && setEntries(fresh))
      .catch(() => live && setEntries((prev) => prev ?? []));
    return () => {
      live = false;
    };
  }, [enabled, userId]);
  return enabled ? entries : null;
}

/** The details of a library title, from anywhere (the category page opens them). */
function useOpenTitle() {
  const router = useRouter();
  return useCallback(
    (e: { id: string; category: CategorySlug }) =>
      router.push(`/${e.category}?open=${encodeURIComponent(e.id)}&t=${Date.now().toString(36)}`),
    [router],
  );
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** Notes or a review with its `[[links]]` live. Plain text when it has none. */
export function LinkedText({
  text,
  from,
  className,
}: {
  text: string;
  /** The title the text belongs to (same-section preference, never itself). */
  from?: LinkSource;
  className?: string;
}) {
  const segments = useMemo(() => parseNoteLinks(text), [text]);
  const hasLinks = segments.some((s) => s.kind === 'link');
  const index = useLibraryIndex(hasLinks);
  const open = useOpenTitle();
  const titleOf = useDisplayTitle();

  return (
    <span className={cn('whitespace-pre-wrap break-words', className)}>
      {segments.map((s, i) => {
        if (s.kind === 'text') return <span key={i}>{s.text}</span>;
        const hit = index ? resolveNoteLink(s.target, index, from) : null;
        if (!hit) {
          return (
            <span
              key={i}
              title={index ? 'Not in your library' : undefined}
              className={cn(index && 'cursor-help underline decoration-dotted underline-offset-2')}
            >
              {s.label}
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              open(hit);
            }}
            title={`${titleOf(hit)} · ${CATEGORIES[hit.category].singular}`}
            className="inline font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {s.label}
          </button>
        );
      })}
    </span>
  );
}

/** A small rendered copy under a field, shown only once the text has a link. */
export function LinkPreview({ text, from }: { text: string; from?: LinkSource }) {
  if (!text.includes('[[') || !parseNoteLinks(text).some((s) => s.kind === 'link')) return null;
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
      <LinkedText text={text} from={from} />
    </div>
  );
}

// ── Autocomplete ────────────────────────────────────────────────────────────

const MAX_SUGGESTIONS = 6;

type LinkTextareaProps = Omit<React.ComponentProps<typeof Textarea>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** The title being edited: left out of the suggestions. */
  selfId?: string;
};

/** A Textarea that suggests library titles after `[[` (Enter/Tab picks, Esc closes). */
export const LinkTextarea = forwardRef<HTMLTextAreaElement, LinkTextareaProps>(function LinkTextarea(
  { value, onValueChange, selfId, onKeyDown, className, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
  const titleOf = useDisplayTitle();
  const [caret, setCaret] = useState<number | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  const query = caret == null ? null : linkQueryAt(value, caret);
  const active = query != null && dismissedAt !== query.start;
  const index = useLibraryIndex(active || value.includes('[['));
  const suggestions = useMemo(() => {
    if (!active || !index || !query) return [];
    const pool = index.filter((e) => e.id !== selfId);
    return query.query.trim()
      ? rankFuzzy(pool, query.query, (e) => titleVariants(e), MAX_SUGGESTIONS)
      : pool.slice(0, MAX_SUGGESTIONS);
  }, [active, index, query, selfId]);
  const open = suggestions.length > 0;

  useEffect(() => setHighlight(0), [query?.start, query?.query]);

  // Put the caret after a completed link once React has the new value.
  useLayoutEffect(() => {
    const el = inner.current;
    if (el && pendingCaret.current != null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      setCaret(pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);

  // Esc closes the list without closing the dialog around the field.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.activeElement !== inner.current || !query) return;
      e.stopPropagation();
      e.preventDefault();
      setDismissedAt(query.start);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, query]);

  const syncCaret = () => setCaret(inner.current?.selectionStart ?? null);

  function pick(entry: LibraryIndexEntry) {
    if (!query || caret == null) return;
    const next = completeLink(value, query.start, caret, titleOf(entry));
    pendingCaret.current = next.caret;
    onValueChange(next.text);
  }

  const listId = rest.id ? `${rest.id}-links` : undefined;

  return (
    <div className="relative">
      <Textarea
        {...rest}
        ref={inner}
        value={value}
        className={className}
        role={open ? 'combobox' : undefined}
        aria-expanded={open ? true : undefined}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        onChange={(e) => {
          onValueChange(e.target.value);
          setCaret(e.target.selectionStart);
        }}
        onSelect={syncCaret}
        onClick={syncCaret}
        onBlur={() => setCaret(null)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setHighlight((h) => (h + step + suggestions.length) % suggestions.length);
              return;
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
              e.preventDefault();
              pick(suggestions[highlight] ?? suggestions[0]);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Link to a title"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 text-sm shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5',
                i === highlight && 'bg-accent text-accent-foreground',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{titleOf(s)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {CATEGORIES[s.category].singular}
                {s.year != null && ` · ${s.year}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

// ── Mentioned in ────────────────────────────────────────────────────────────

/** Titles whose notes or reviews link here. Render with `key={activityId}`. */
export function MentionedIn({ activityId }: { activityId: string }) {
  const [items, setItems] = useState<LibraryIndexEntry[] | null>(null);
  const open = useOpenTitle();
  const titleOf = useDisplayTitle();

  useEffect(() => {
    let live = true;
    getMentionedIn(activityId)
      .then((res) => live && setItems(res.ok ? (res.items ?? []) : []))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [activityId]);

  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Mentioned in
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => open(e)}
              className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs hover:bg-accent hover:text-accent-foreground"
            >
              {titleOf(e)}
              <span className="text-muted-foreground"> · {CATEGORIES[e.category].singular}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
