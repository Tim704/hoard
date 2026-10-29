// ───────────────────────────────────────────────────────────────────────────
//  The optimistic overlay behind the instant layout / title-view switch
//  (src/components/prefs-provider.tsx). A choice shows at once as an overlay
//  over the server's display prefs while it saves; the overlay entry goes
//  once the server has caught up. Pure, so the rules are unit-tested.
// ───────────────────────────────────────────────────────────────────────────

import type { DisplayPrefs } from '@/lib/display-prefs';

/** The display prefs that switch instantly, with Undo. */
export type LivePrefs = Pick<DisplayPrefs, 'layout' | 'titleView'>;
export type LivePrefKey = keyof LivePrefs;
export const LIVE_PREF_KEYS = ['layout', 'titleView'] as const satisfies readonly LivePrefKey[];

/** Pending (not yet confirmed) values over the server's. */
export type Overlay = Partial<LivePrefs>;
/** Saves still in flight, per key. */
export type InFlight = Record<LivePrefKey, number>;

export const NONE_IN_FLIGHT: InFlight = { layout: 0, titleView: 0 };

export function liveSlice(prefs: LivePrefs): LivePrefs {
  return { layout: prefs.layout, titleView: prefs.titleView };
}

/**
 * The overlay after the server props went from `before` to `after`. An entry
 * is dropped once nothing for its key is in flight any more and the server
 * either holds the same value (the save landed) or changed it on its own
 * (another tab or device saved since). While a save is in flight the entry
 * stays, so an older save landing first doesn't flash its value. Returns the
 * same object when nothing changes.
 */
export function reconcileOverlay(overlay: Overlay, before: LivePrefs, after: LivePrefs, inFlight: InFlight): Overlay {
  let next: Overlay | null = null;
  for (const key of LIVE_PREF_KEYS) {
    if (!(key in overlay) || inFlight[key] > 0) continue;
    if (overlay[key] === after[key] || before[key] !== after[key]) {
      next ??= { ...overlay };
      delete next[key];
    }
  }
  return next ?? overlay;
}

/** What client components see: the server's prefs with the overlay on top. */
export function withOverlay<P extends LivePrefs>(prefs: P, overlay: Overlay): P {
  return Object.keys(overlay).length ? { ...prefs, ...overlay } : prefs;
}
