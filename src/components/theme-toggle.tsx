'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { useLayout } from '@/components/prefs-provider';
import { Button } from '@/components/ui/button';
import { THEME_STORAGE_KEY } from '@/lib/document-theme';

/**
 * Light/dark switching. This project does NOT use next-themes — the theme is
 * just the `dark` class on <html>, applied pre-paint by the no-FOUC script in
 * layout.tsx and persisted in localStorage under `hoard-theme`.
 *
 * `hidden` in a layout that forces dark (Fresh); the stored choice is kept
 * for when the user leaves it (src/lib/document-theme.ts).
 *
 * `mounted` guards against a hydration mismatch: the server can't know which
 * theme the client resolved, so render a stable placeholder until mounted.
 */
export function useThemeToggle() {
  const { forceDark } = useLayout();
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Follow the class itself: a layout switch (leaving Fresh restores the
  // stored theme) or the other toggle (Classic's footer and the user menu)
  // may change it.
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains('dark'));
    read();
    setMounted(true);
    const watch = new MutationObserver(read);
    watch.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => watch.disconnect();
  }, []);

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

  return { hidden: forceDark, mounted, isDark, toggle };
}

/** The light/dark icon button (Classic's sidebar footer). */
export function ThemeToggle() {
  const { hidden, mounted, isDark, toggle } = useThemeToggle();
  if (hidden) return null;

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
