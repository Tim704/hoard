'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowUpToLine, Check, CornerDownLeft, FileText, ImageOff, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { useDisplayTitle, usePrefs } from '@/components/prefs-provider';
import { toastStatusChange } from '@/components/undo-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { updateActivity } from '@/lib/actions/media';
import { moveToQueueTop } from '@/lib/actions/queue';
import { libraryIndex } from '@/lib/actions/search';
import { CATEGORIES, NAV_ORDER } from '@/lib/categories';
import type { LibraryIndexEntry } from '@/lib/data-search';
import { rankFuzzy } from '@/lib/fuzzy';
import { SETTINGS_TABS, SETTINGS_TAB_LABELS, settingsHref } from '@/lib/settings-nav';
import { nextHighlight } from '@/lib/search-nav';
import { statusLabel, type Status } from '@/lib/status';
import { titleVariants } from '@/lib/title';
import { cn } from '@/lib/utils';

// ───────────────────────────────────────────────────────────────────────────
//  The Cmd/Ctrl+K palette (spec 2.6), built on the app's Dialog. Fuzzy-finds
//  library titles and pages. On a highlighted title: Enter opens its details,
//  Cmd/Ctrl+Enter marks it as done, Alt+Enter moves it to the top of Up next
//  (Planned titles). With no match, Enter runs Search everything.
//
//  The library index is fetched on the first open and kept in memory for the
//  session; later opens show it at once and refresh it in the background.
// ───────────────────────────────────────────────────────────────────────────

/** The session cache, tagged with its owner so another sign-in never sees it. */
let cache: { userId: string; entries: LibraryIndexEntry[] } | null = null;

const cachedFor = (userId: string) => (cache && cache.userId === userId ? cache.entries : null);

type Item =
  | { kind: 'title'; entry: LibraryIndexEntry }
  | { kind: 'page'; label: string; href: string }
  | { kind: 'search'; query: string };

const MAX_TITLES = 30;

export function CommandPalette({
  userId,
  open,
  onOpenChange,
  onSearchEverything,
}: {
  /** The signed-in user: the index cache only serves its owner. */
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchEverything: (query: string) => void;
}) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const { hiddenSections } = usePrefs();
  const [index, setIndex] = useState<LibraryIndexEntry[] | null>(() => cachedFor(userId));
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch (or refresh) the index whenever the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    // A different user signed in on this browser: drop the old index first.
    if (cache && cache.userId !== userId) cache = null;
    setIndex(cachedFor(userId));
    let live = true;
    libraryIndex()
      .then((fresh) => {
        cache = { userId, entries: fresh };
        if (live) setIndex(fresh);
      })
      .catch(() => {
        if (live && !cachedFor(userId)) setIndex([]);
      });
    return () => {
      live = false;
    };
  }, [open, userId]);

  const pages = useMemo(() => {
    const hidden = new Set<string>(hiddenSections);
    const list: Array<{ label: string; href: string }> = [{ label: 'Dashboard', href: '/dashboard' }];
    for (const slug of NAV_ORDER) {
      if (hidden.has(slug)) continue;
      list.push({ label: CATEGORIES[slug].label, href: `/${slug}` });
      list.push({ label: `${CATEGORIES[slug].label} · Tiers`, href: `/${slug}/arena` });
    }
    if (!hidden.has('franchises')) list.push({ label: 'Franchises', href: '/franchises' });
    list.push({ label: 'Stats', href: '/stats' });
    list.push({ label: 'Views', href: '/views' });
    list.push({ label: 'Add by link', href: '/add' });
    list.push({ label: 'Import', href: '/import' });
    list.push({ label: 'Settings', href: '/settings' });
    // Found by name only ("themes", "accounts"…). System is left out: it is the owner's alone.
    for (const tab of SETTINGS_TABS) {
      if (tab !== 'system') list.push({ label: `Settings · ${SETTINGS_TAB_LABELS[tab]}`, href: settingsHref(tab) });
    }
    return list;
  }, [hiddenSections]);

  const items: Item[] = useMemo(() => {
    const q = query.trim();
    if (!q) return pages.filter((p) => !p.label.includes('·')).map((p) => ({ kind: 'page', ...p }));
    const titles = rankFuzzy(index ?? [], q, (e) => titleVariants(e), MAX_TITLES).map(
      (entry): Item => ({ kind: 'title', entry }),
    );
    const pageHits = rankFuzzy(pages, q, (p) => [p.label], 6).map((p): Item => ({ kind: 'page', ...p }));
    const out = [...titles, ...pageHits];
    // Search everything is always the last option (and the only one with no match).
    out.push({ kind: 'search', query: q });
    return out;
  }, [query, index, pages]);

  const current = items[highlight] ?? null;

  function close() {
    onOpenChange(false);
  }

  function openDetails(entry: LibraryIndexEntry) {
    close();
    // `t` makes every request new, so picking the same title again reopens it.
    router.push(`/${entry.category}?open=${encodeURIComponent(entry.id)}&t=${Date.now().toString(36)}`);
  }

  /** Patch one title's status in the shown index and the session cache. */
  function setStatus(id: string, status: Status) {
    const patch = (list: LibraryIndexEntry[]) => list.map((e) => (e.id === id ? { ...e, status } : e));
    if (cache?.userId === userId) cache = { userId, entries: patch(cache.entries) };
    setIndex((prev) => (prev ? patch(prev) : prev));
  }

  async function markDone(entry: LibraryIndexEntry) {
    if (entry.status === 'COMPLETED' || busy) return;
    setBusy(true);
    try {
      const res = await updateActivity(entry.id, { status: 'COMPLETED' });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not update that title.');
        return;
      }
      setStatus(entry.id, 'COMPLETED');
      toastStatusChange(
        `Marked “${titleOf(entry)}” as ${statusLabel('COMPLETED', entry.category)}.`,
        entry.id,
        res.previous,
        () => {
          setStatus(entry.id, res.previous?.status ?? entry.status);
          router.refresh();
        },
      );
      router.refresh();
    } catch {
      toast.error('Could not update that title.');
    } finally {
      setBusy(false);
    }
  }

  async function moveTop(entry: LibraryIndexEntry) {
    if (entry.status !== 'PLANNED' || busy) return;
    setBusy(true);
    try {
      const res = await moveToQueueTop(entry.id);
      if (!res.ok) {
        toast.error(res.error ?? 'Could not move that title.');
        return;
      }
      toast.success(`“${titleOf(entry)}” is now first in Up next.`);
      router.refresh();
    } catch {
      toast.error('Could not move that title.');
    } finally {
      setBusy(false);
    }
  }

  function activate(item: Item | null) {
    if (!item) return;
    if (item.kind === 'title') openDetails(item.entry);
    else if (item.kind === 'page') {
      close();
      router.push(item.href);
    } else {
      close();
      onSearchEverything(item.query);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = nextHighlight(highlight, e.key === 'ArrowDown' ? 1 : -1, items.length);
      setHighlight(next);
      requestAnimationFrame(() =>
        document.getElementById(`palette-option-${next}`)?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (current?.kind === 'title' && (e.metaKey || e.ctrlKey)) void markDone(current.entry);
      else if (current?.kind === 'title' && e.altKey) void moveTop(current.entry);
      else activate(current);
    }
  }

  const loadingIndex = index === null && open;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[10%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[15%] sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Find a title or page in your library.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Find a title or page…"
            className="h-12 flex-1 bg-transparent pr-8 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            role="combobox"
            aria-label="Find a title or page"
            aria-expanded={items.length > 0}
            aria-controls="palette-options"
            aria-activedescendant={current ? `palette-option-${highlight}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            autoFocus
          />
          {(loadingIndex || busy) && <Loader2 className="mr-6 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        </div>

        <div ref={listRef} id="palette-options" role="listbox" aria-label="Matches" className="max-h-[55dvh] overflow-y-auto p-1.5">
          {items.map((item, i) => {
            const active = i === highlight;
            const base = cn(
              'flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm',
              active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            );
            if (item.kind === 'title') {
              const e = item.entry;
              return (
                <div
                  key={`t:${e.id}`}
                  id={`palette-option-${i}`}
                  role="option"
                  aria-selected={active}
                  className={base}
                  onMouseMove={() => setHighlight(i)}
                  onClick={() => openDetails(e)}
                >
                  <div className="relative h-10 w-7 shrink-0 overflow-hidden rounded bg-muted">
                    {e.imageUrl ? (
                      <Image src={e.imageUrl} alt="" fill sizes="28px" className="object-cover" />
                    ) : (
                      <ImageOff className="m-auto mt-3 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {titleOf(e)}
                      {e.year != null && <span className="ml-1 font-normal text-muted-foreground">({e.year})</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {CATEGORIES[e.category].label} · {statusLabel(e.status, e.category)}
                    </p>
                  </div>
                  {active && (
                    <div className="flex shrink-0 gap-1">
                      {e.status !== 'COMPLETED' && (
                        <PaletteAction
                          label={`Mark as ${statusLabel('COMPLETED', e.category)}`}
                          onClick={() => void markDone(e)}
                          disabled={busy}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </PaletteAction>
                      )}
                      {e.status === 'PLANNED' && (
                        <PaletteAction label="Move to top of Up next" onClick={() => void moveTop(e)} disabled={busy}>
                          <ArrowUpToLine className="h-3.5 w-3.5" />
                        </PaletteAction>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            if (item.kind === 'page') {
              return (
                <div
                  key={`p:${item.href}`}
                  id={`palette-option-${i}`}
                  role="option"
                  aria-selected={active}
                  className={base}
                  onMouseMove={() => setHighlight(i)}
                  onClick={() => activate(item)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{item.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Page</span>
                </div>
              );
            }
            return (
              <div
                key="search"
                id={`palette-option-${i}`}
                role="option"
                aria-selected={active}
                className={base}
                onMouseMove={() => setHighlight(i)}
                onClick={() => activate(item)}
              >
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">
                  Search everything for “{item.query}”
                </span>
              </div>
            );
          })}
          {query.trim() && items.length === 1 && !loadingIndex && (
            <p className="px-2 py-3 text-xs text-muted-foreground">Nothing in your library matches.</p>
          )}
        </div>

        <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground sm:flex">
          <span>↑↓ move</span>
          <span className="inline-flex items-center gap-0.5">
            <CornerDownLeft className="h-3 w-3" aria-hidden /> open
          </span>
          <span>⌘/Ctrl+↵ mark as done</span>
          <span>Alt+↵ top of Up next</span>
          <span>Esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaletteAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground hover:bg-accent disabled:opacity-50"
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
