import { describe, expect, it } from 'vitest';

import {
  NONE_IN_FLIGHT,
  reconcileOverlay,
  settleSave,
  withOverlay,
  type InFlight,
  type LivePrefs,
  type SaveState,
} from './display-overlay';

const server = (layout: LivePrefs['layout'], titleView: LivePrefs['titleView'] = 'popup'): LivePrefs => ({
  layout,
  titleView,
});
const saving = (layout: number, titleView = 0): InFlight => ({ layout, titleView });

describe('reconcileOverlay', () => {
  it('keeps the same object when nothing changes', () => {
    const overlay = { layout: 'fresh' as const };
    expect(reconcileOverlay(overlay, server('classic'), server('classic'), saving(1))).toBe(overlay);
    const empty = {};
    expect(reconcileOverlay(empty, server('classic'), server('fresh'), NONE_IN_FLIGHT)).toBe(empty);
  });

  it('drops an entry once its save landed and nothing is in flight', () => {
    // The save resolved first, the new props arrive after it…
    expect(reconcileOverlay({ layout: 'fresh' }, server('classic'), server('fresh'), NONE_IN_FLIGHT)).toEqual({});
    // …or the props arrived while it was still in flight: dropped when it settles.
    expect(reconcileOverlay({ layout: 'fresh' }, server('fresh'), server('fresh'), saving(1))).toEqual({
      layout: 'fresh',
    });
    expect(reconcileOverlay({ layout: 'fresh' }, server('fresh'), server('fresh'), NONE_IN_FLIGHT)).toEqual({});
  });

  it('holds the newest choice while an older save lands first', () => {
    // classic → fresh → minimal quickly: the fresh save lands while minimal's is in flight.
    expect(reconcileOverlay({ layout: 'minimal' }, server('classic'), server('fresh'), saving(1))).toEqual({
      layout: 'minimal',
    });
  });

  it('keeps a confirmed value until the props catch up', () => {
    // Saved, nothing in flight, but the server props are still the old ones.
    expect(reconcileOverlay({ layout: 'fresh' }, server('classic'), server('classic'), NONE_IN_FLIGHT)).toEqual({
      layout: 'fresh',
    });
  });

  it('lets a change from elsewhere win when nothing is in flight', () => {
    expect(reconcileOverlay({ layout: 'fresh' }, server('classic'), server('organised'), NONE_IN_FLIGHT)).toEqual({});
  });

  it('treats each key on its own', () => {
    const overlay = { layout: 'fresh' as const, titleView: 'page' as const };
    expect(reconcileOverlay(overlay, server('classic', 'popup'), server('fresh', 'popup'), saving(0, 1))).toEqual({
      titleView: 'page',
    });
  });
});

describe('withOverlay', () => {
  it('puts pending values over the server prefs', () => {
    const prefs = { ...server('classic'), weekStart: 1 };
    expect(withOverlay(prefs, {})).toBe(prefs);
    expect(withOverlay(prefs, { layout: 'fresh' })).toEqual({ layout: 'fresh', titleView: 'popup', weekStart: 1 });
  });
});

describe('settleSave', () => {
  const at = (confirmed: LivePrefs, reported: LivePrefs = confirmed): SaveState => ({ confirmed, reported });

  it('confirms a successful save and reports it, with Undo to the value before', () => {
    expect(settleSave(at(server('classic')), 'layout', 'fresh', true, true)).toEqual({
      state: at(server('fresh')),
      outcome: { kind: 'saved', undoTo: 'classic' },
    });
  });

  it('rolls a failed newest save back to the confirmed value', () => {
    const state = at(server('classic'));
    const res = settleSave(state, 'layout', 'fresh', false, true);
    expect(res.outcome).toEqual({ kind: 'failed', rollbackTo: 'classic' });
    expect(res.state).toEqual(state);
  });

  it('never rolls back to an earlier choice that was not saved', () => {
    // classic (saved) → minimal → fresh quickly; minimal's save fails first
    // (superseded: silent), then fresh's fails: back to classic, not minimal.
    const minimal = settleSave(at(server('classic')), 'layout', 'minimal', false, false);
    expect(minimal.outcome).toEqual({ kind: 'superseded' });
    expect(settleSave(minimal.state, 'layout', 'fresh', false, true).outcome).toEqual({
      kind: 'failed',
      rollbackTo: 'classic',
    });
  });

  it('counts a superseded save that succeeded as confirmed', () => {
    // classic → minimal → fresh: minimal saves (silently), fresh fails → minimal.
    const minimal = settleSave(at(server('classic')), 'layout', 'minimal', true, false);
    expect(minimal.outcome).toEqual({ kind: 'superseded' });
    expect(minimal.state.confirmed.layout).toBe('minimal');
    const fresh = settleSave(minimal.state, 'layout', 'fresh', false, true);
    expect(fresh.outcome).toEqual({ kind: 'failed', rollbackTo: 'minimal' });
    // The screen shows minimal again: that is what the user now knows.
    expect(fresh.state.reported.layout).toBe('minimal');
  });

  it('a quick switch away and back reports nothing', () => {
    // classic → fresh → classic within one burst: the save of classic changes nothing.
    expect(settleSave(at(server('classic')), 'layout', 'classic', true, true).outcome).toEqual({ kind: 'unchanged' });
  });

  it('reports a change whose own save was superseded by one of the same value', () => {
    // classic → fresh (its save in flight) → minimal → fresh quickly: the
    // first save lands superseded, the second (fresh again) must still toast
    // the committed change, with Undo back to classic.
    const first = settleSave(at(server('classic')), 'layout', 'fresh', true, false);
    expect(first.outcome).toEqual({ kind: 'superseded' });
    expect(settleSave(first.state, 'layout', 'fresh', true, true)).toEqual({
      state: at(server('fresh')),
      outcome: { kind: 'saved', undoTo: 'classic' },
    });
  });

  it('after a failed save, Undo goes to the last confirmed value', () => {
    // classic → fresh (fails, superseded) → minimal (saved): Undo → classic, not fresh.
    const fresh = settleSave(at(server('classic')), 'layout', 'fresh', false, false);
    expect(settleSave(fresh.state, 'layout', 'minimal', true, true).outcome).toEqual({ kind: 'saved', undoTo: 'classic' });
  });

  it('treats each key on its own', () => {
    const res = settleSave(at(server('fresh', 'popup')), 'titleView', 'page', false, true);
    expect(res.outcome).toEqual({ kind: 'failed', rollbackTo: 'popup' });
    expect(settleSave(at(server('fresh', 'popup')), 'titleView', 'page', true, true).state).toEqual(at(server('fresh', 'page')));
  });
});
