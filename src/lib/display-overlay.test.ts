import { describe, expect, it } from 'vitest';

import {
  NONE_IN_FLIGHT,
  reconcileOverlay,
  settleSave,
  withOverlay,
  type InFlight,
  type LivePrefs,
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
  it('confirms a successful save and reports it when it is the newest', () => {
    expect(settleSave(server('classic'), 'layout', 'fresh', true, true)).toEqual({
      confirmed: server('fresh'),
      outcome: { kind: 'saved' },
    });
  });

  it('rolls a failed newest save back to the confirmed value', () => {
    const confirmed = server('classic');
    const res = settleSave(confirmed, 'layout', 'fresh', false, true);
    expect(res.outcome).toEqual({ kind: 'failed', rollbackTo: 'classic' });
    expect(res.confirmed).toBe(confirmed);
  });

  it('never rolls back to an earlier choice that was not saved', () => {
    // classic (saved) → minimal → fresh quickly; minimal's save fails first
    // (superseded: silent), then fresh's fails: back to classic, not minimal.
    let confirmed = server('classic');
    const minimal = settleSave(confirmed, 'layout', 'minimal', false, false);
    expect(minimal.outcome).toEqual({ kind: 'superseded' });
    confirmed = minimal.confirmed;
    expect(settleSave(confirmed, 'layout', 'fresh', false, true).outcome).toEqual({
      kind: 'failed',
      rollbackTo: 'classic',
    });
  });

  it('counts a superseded save that succeeded as confirmed', () => {
    // classic → minimal → fresh: minimal saves (silently), fresh fails → minimal.
    let confirmed = server('classic');
    const minimal = settleSave(confirmed, 'layout', 'minimal', true, false);
    expect(minimal.outcome).toEqual({ kind: 'superseded' });
    confirmed = minimal.confirmed;
    expect(confirmed.layout).toBe('minimal');
    expect(settleSave(confirmed, 'layout', 'fresh', false, true).outcome).toEqual({
      kind: 'failed',
      rollbackTo: 'minimal',
    });
  });

  it('treats each key on its own', () => {
    const res = settleSave(server('fresh', 'popup'), 'titleView', 'page', false, true);
    expect(res.outcome).toEqual({ kind: 'failed', rollbackTo: 'popup' });
    expect(settleSave(server('fresh', 'popup'), 'titleView', 'page', true, true).confirmed).toEqual(
      server('fresh', 'page'),
    );
  });
});
