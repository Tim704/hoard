'use client';

import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { applyLayoutToDocument } from '@/lib/document-theme';
import { resolveLayout, type LayoutId } from '@/lib/layouts';

/**
 * Redoes <html>'s layout state (the `dark` class, theme-color) whenever the
 * server's layout changes without a full page load: logging in or out
 * navigates client-side, so the head bootstrap doesn't run again. Rendered
 * by the root layout after the page, so it runs after PrefsProvider's effect
 * in the same commit; it reads the attribute rather than its prop, so a
 * choice that is still saving (PrefsProvider's overlay) wins.
 */
export function LayoutSync({ layout }: { layout: LayoutId }) {
  useIsomorphicLayoutEffect(() => {
    applyLayoutToDocument(resolveLayout(document.documentElement.dataset.layout));
  }, [layout]);
  return null;
}
