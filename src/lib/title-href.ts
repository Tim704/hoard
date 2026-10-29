// ───────────────────────────────────────────────────────────────────────────
//  Where a title opens (Settings → Themes → Title view). Pure.
//  - popup: its section page opens the short popup (`/books?open=<id>`);
//  - page:  its own page (`/books/title/<id>`).
//  `?open=` is the universal link: notifications, the iCal feed and jobs
//  store it, and in page mode the section page redirects it to the title
//  page, so a stored link works in either view.
// ───────────────────────────────────────────────────────────────────────────

import type { TitleView } from '@/lib/display-prefs';

/**
 * A title's link in the given title view. `nonce` (popup only) makes the
 * link new each time, so picking the same title again reopens its popup.
 */
export function titleHref(slug: string, id: string, mode: TitleView, opts: { nonce?: string } = {}): string {
  const enc = encodeURIComponent(id);
  if (mode === 'page') return `/${slug}/title/${enc}`;
  return `/${slug}?open=${enc}${opts.nonce ? `&t=${encodeURIComponent(opts.nonce)}` : ''}`;
}

/** The universal link to a title (`?open=`), for anything stored for later. */
export function universalTitleHref(slug: string, id: string): string {
  return titleHref(slug, id, 'popup');
}

/** A short value that differs per click (the popup's `t=`). */
export function clickNonce(now: number = Date.now()): string {
  return now.toString(36);
}

/** One of the user's own titles, as far as routing needs it. */
export interface OwnedTitleRef {
  id: string;
  category: string;
}

export type TitlePageOutcome = { kind: 'show' } | { kind: 'redirect'; href: string } | { kind: 'not-found' };

/**
 * What `/<requested>/title/<id>` does, given the user's own title with that
 * id (null: unknown, or someone else's — the same answer): shows it, moves
 * to its own section's address, or 404s.
 */
export function titlePageOutcome(requested: string, found: OwnedTitleRef | null): TitlePageOutcome {
  if (!found) return { kind: 'not-found' };
  if (found.category !== requested) return { kind: 'redirect', href: titleHref(found.category, found.id, 'page') };
  return { kind: 'show' };
}

/**
 * A section page opened with `?open=<id>`: in page mode, the title page to go
 * to instead (in whichever section the title is); null to stay (popup mode,
 * or a title that isn't the user's, which then simply doesn't open).
 */
export function openRedirect(mode: TitleView, found: OwnedTitleRef | null): string | null {
  if (mode !== 'page' || !found) return null;
  return titleHref(found.category, found.id, 'page');
}
