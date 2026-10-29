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

/**
 * Per key, what the server is known to hold (`confirmed`: the server props,
 * moved on by every save that succeeded) and what the user was last told it
 * holds (`reported`: the server's value, a save's toast, or a rollback).
 * Undo goes back to `reported`, which is always a value the server held.
 */
export interface SaveState {
  confirmed: LivePrefs;
  reported: LivePrefs;
}

export function initialSaveState(server: LivePrefs): SaveState {
  return { confirmed: liveSlice(server), reported: liveSlice(server) };
}

/** What a finished save means for the screen (see settleSave). */
export type SaveOutcome<V> =
  | { kind: 'superseded' }
  | { kind: 'unchanged' }
  | { kind: 'saved'; undoTo: V }
  | { kind: 'failed'; rollbackTo: V };

/**
 * A save of `key = value` finished (`ok`). A successful save moves
 * `confirmed`, even one a newer change has superseded (the server still
 * stored it). Only the newest change for a key reports:
 * - saved: a toast, unless the user was already told the server holds this
 *   value (`unchanged`: a quick switch away and back); its Undo goes to the
 *   value reported before, so every committed change gets its toast and
 *   Undo never lands on a value that was never saved;
 * - failed: the screen goes back to the last confirmed value, never to an
 *   earlier choice that was never saved.
 */
export function settleSave<K extends LivePrefKey>(
  state: SaveState,
  key: K,
  value: LivePrefs[K],
  ok: boolean,
  newest: boolean,
): { state: SaveState; outcome: SaveOutcome<LivePrefs[K]> } {
  const confirmed = ok && state.confirmed[key] !== value ? { ...state.confirmed, [key]: value } : state.confirmed;
  if (!newest) return { state: { ...state, confirmed }, outcome: { kind: 'superseded' } };
  if (ok) {
    const before = state.reported[key] as LivePrefs[K];
    if (before === value) return { state: { ...state, confirmed }, outcome: { kind: 'unchanged' } };
    return { state: { confirmed, reported: { ...state.reported, [key]: value } }, outcome: { kind: 'saved', undoTo: before } };
  }
  const rollbackTo = state.confirmed[key] as LivePrefs[K];
  return {
    state: { confirmed: state.confirmed, reported: { ...state.reported, [key]: rollbackTo } },
    outcome: { kind: 'failed', rollbackTo },
  };
}
