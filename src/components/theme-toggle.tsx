'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { useLayout } from '@/components/prefs-provider';
import { Button } from '@/components/ui/button';
import { THEME_STORAGE_KEY } from '@/lib/document-theme';

/**
 * Light/dark theme toggle. This project does NOT use next-themes — the theme is
 * just the `dark` class on <html>, applied pre-paint by the no-FOUC script in
 * layout.tsx and persisted in localStorage under `hoard-theme`.
 *
 * Hidden in a layout that forces dark (Fresh); the stored choice is kept for
 * when the user leaves it (src/lib/document-theme.ts).
 *
 * A `mounted` guard avoids a hydration mismatch: the server can't know which
 * theme the client resolved, so we render a stable placeholder until mounted.
 */
export function ThemeToggle() {
  const { id: layout, forceDark } = useLayout();
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Re-read after a layout switch: leaving Fresh restores the stored theme.
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, [layout]);

  if (forceDark) return null;

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // localStorage unavailable (private mode etc.) — theme still toggles for the session.
    }
    setIsDark(next);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
      title={mounted ? (isDark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle theme'}
      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
    >
      {/* Until mounted, render a stable icon to keep SSR and first client paint in sync. */}
      {mounted && isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
