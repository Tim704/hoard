'use client';

import { useCallback, useRef } from 'react';

/**
 * Focus return for a dialog opened without a Radix DialogTrigger (from the
 * user menu, a shortcut, another component). Radix's modal Dialog hands focus
 * back to its own trigger on close, so without one it would end on <body>.
 *
 * - `remember()` when opening: notes what has focus. Focus inside a dialog
 *   that is handing over (the palette opening Search everything) is skipped,
 *   so the first opener is kept.
 * - `restore` as the content's `onCloseAutoFocus`: focuses it again, unless
 *   another dialog is open by then (it keeps the target for that one).
 */
export function useFocusReturn() {
  const target = useRef<HTMLElement | null>(null);

  const remember = useCallback(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el.closest('[role="dialog"]')) return;
    target.current = el === document.body ? null : el;
  }, []);

  const restore = useCallback((e: Event) => {
    const el = target.current;
    if (!el?.isConnected) {
      target.current = null;
      return;
    }
    e.preventDefault();
    if (document.querySelector('[role="dialog"]')) return;
    target.current = null;
    el.focus({ preventScroll: true });
  }, []);

  return { remember, restore };
}
