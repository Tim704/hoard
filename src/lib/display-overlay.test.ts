import { describe, expect, it } from 'vitest';

import { NONE_IN_FLIGHT, reconcileOverlay, withOverlay, type InFlight, type LivePrefs } from './display-overlay';

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
