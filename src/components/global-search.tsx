'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { CommandPalette } from '@/components/command-palette';
import { SearchEverythingDialog } from '@/components/search-everything';
import { useFocusReturn } from '@/hooks/use-focus-return';
import { globalShortcut, isApplePlatform } from '@/lib/keys';

// ───────────────────────────────────────────────────────────────────────────
//  The app-wide search surfaces: Search everything (2.5: `/`, or Search in
//  the user menu) and the Cmd/Ctrl+K palette (2.6, or Command palette in
//  the user menu). Mounted once by the (app) layout; buttons reach them
//  through `useGlobalSearch`.
// ───────────────────────────────────────────────────────────────────────────

interface GlobalSearchApi {
  openSearch: (query?: string) => void;
  openPalette: () => void;
  /** The signed-in user (keys client-side caches such as the library index). */
  userId: string | null;
}

const GlobalSearchContext = createContext<GlobalSearchApi>({ openSearch: () => {}, openPalette: () => {}, userId: null });

export function useGlobalSearch(): GlobalSearchApi {
  return useContext(GlobalSearchContext);
}

export function GlobalSearchProvider({
  userId,
  social,
  children,
}: {
  userId: string;
  /** The viewer's sharing opt-ins: the palette lists the Friends pages only with them. */
  social: { compare: boolean; feed: boolean };
  children: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Neither dialog has a trigger: closing one focuses what opened it.
  const { remember, restore } = useFocusReturn();

  const openSearch = useCallback(
    (query = '') => {
      remember();
      setPaletteOpen(false);
      setSearchQuery(query);
      setSearchOpen(true);
    },
    [remember],
  );
  const openPalette = useCallback(() => {
    remember();
    setSearchOpen(false);
    setPaletteOpen(true);
  }, [remember]);

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
        remember();
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
  }, [openSearch, remember]);

  const api = useMemo(() => ({ openSearch, openPalette, userId }), [openSearch, openPalette, userId]);

  return (
    <GlobalSearchContext.Provider value={api}>
      {children}
      <SearchEverythingDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        initialQuery={searchQuery}
        onCloseAutoFocus={restore}
      />
      <CommandPalette
        userId={userId}
        social={social}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSearchEverything={openSearch}
        onCloseAutoFocus={restore}
      />
    </GlobalSearchContext.Provider>
  );
}
