'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { CommandPalette } from '@/components/command-palette';
import { SearchEverythingDialog } from '@/components/search-everything';
import { globalShortcut, isApplePlatform } from '@/lib/keys';
import { cn } from '@/lib/utils';

// ───────────────────────────────────────────────────────────────────────────
//  The app-wide search surfaces: Search everything (2.5: the header button
//  and `/`) and the Cmd/Ctrl+K palette (2.6). Mounted once by the (app)
//  layout; buttons reach them through `useGlobalSearch`.
// ───────────────────────────────────────────────────────────────────────────

interface GlobalSearchApi {
  openSearch: (query?: string) => void;
  openPalette: () => void;
}

const GlobalSearchContext = createContext<GlobalSearchApi>({ openSearch: () => {}, openPalette: () => {} });

export function useGlobalSearch(): GlobalSearchApi {
  return useContext(GlobalSearchContext);
}

export function GlobalSearchProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openSearch = useCallback((query = '') => {
    setPaletteOpen(false);
    setSearchQuery(query);
    setSearchOpen(true);
  }, []);
  const openPalette = useCallback(() => {
    setSearchOpen(false);
    setPaletteOpen(true);
  }, []);

  useEffect(() => {
    const apple = isApplePlatform(navigator.platform || navigator.userAgent);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const which = globalShortcut(
        {
          key: e.key,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          target: e.target as HTMLElement | null,
        },
        apple,
      );
      if (which === 'palette') {
        e.preventDefault();
        setSearchOpen(false);
        setPaletteOpen((o) => !o);
      } else if (which === 'search') {
        // Leave `/` alone while another dialog (e.g. Add) is open.
        if (document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        openSearch('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  const api = useMemo(() => ({ openSearch, openPalette }), [openSearch, openPalette]);

  return (
    <GlobalSearchContext.Provider value={api}>
      {children}
      <SearchEverythingDialog open={searchOpen} onOpenChange={setSearchOpen} initialQuery={searchQuery} />
      <CommandPalette userId={userId} open={paletteOpen} onOpenChange={setPaletteOpen} onSearchEverything={openSearch} />
    </GlobalSearchContext.Provider>
  );
}

/** The "Search everything" button in the sidebar / top bar. */
export function SearchEverythingButton({ collapsed = false, compact = false }: { collapsed?: boolean; compact?: boolean }) {
  const { openSearch } = useGlobalSearch();
  const iconOnly = collapsed || compact;
  return (
    <button
      type="button"
      onClick={() => openSearch('')}
      title={iconOnly ? 'Search everything (/)' : undefined}
      aria-label={iconOnly ? 'Search everything' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'p-2' : collapsed ? 'justify-center p-2' : 'w-full border border-border px-3 py-2',
      )}
    >
      <Search className={compact ? 'h-5 w-5' : 'h-4 w-4 shrink-0'} />
      {!iconOnly && (
        <>
          <span>Search everything</span>
          <kbd className="ml-auto rounded border border-border px-1.5 text-[10px] font-medium">/</kbd>
        </>
      )}
    </button>
  );
}
