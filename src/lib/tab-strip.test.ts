import { describe, expect, it } from 'vitest';

import { FADE_PX, STRIP_SCRIPT, syncStrip } from './tab-strip';

/**
 * A fake strip: `width` px wide at `left` on screen, `content` px of tabs
 * inside, scrolled `scrollLeft` (clamped as a browser does), and the open
 * tab at `tab` (its offset and width inside the content) or none.
 */
interface Spec {
  left?: number;
  width: number;
  content: number;
  scrollLeft?: number;
  tab: { at: number; width: number } | null;
}

function fakeStrip({ left = 16, width, content, scrollLeft = 0, tab }: Spec) {
  const max = Math.max(0, content - width);
  let scroll = Math.min(Math.max(0, scrollLeft), max);
  const dataset: Record<string, string> = {};
  const active = tab && {
    getBoundingClientRect: () => ({ left: left + tab.at - scroll, right: left + tab.at - scroll + tab.width, width: tab.width }),
  };
  return {
    dataset,
    scrollWidth: Math.max(content, width),
    clientWidth: width,
    get scrollLeft() {
      return scroll;
    },
    set scrollLeft(v: number) {
      scroll = Math.min(Math.max(0, v), max);
    },
    getBoundingClientRect: () => ({ left, right: left + width, width }),
    querySelector: (sel: string) => (sel === '[aria-current="page"]' ? active : null),
    setAttribute: (name: string, value: string) => {
      dataset[name.replace(/^data-/, '')] = value;
    },
  };
}

type Fake = ReturnType<typeof fakeStrip>;
const state = (ul: Fake) => ({ scrollLeft: ul.scrollLeft, reveal: ul.dataset.reveal, fade: ul.dataset.fade });

/** syncStrip(ul, true), as after hydration. */
function viaSync(spec: Spec) {
  const ul = fakeStrip(spec);
  syncStrip(ul as unknown as HTMLElement, true);
  return state(ul);
}

/** The inline script, run right after the strip as on a page load. */
function viaScript(spec: Spec) {
  const ul = fakeStrip(spec);
  new Function('document', STRIP_SCRIPT)({ currentScript: { previousElementSibling: ul } });
  return state(ul);
}

// A 375 px phone's strip (343 px between the page's 16 px gutters) and a
// 768 px tablet's, with tabs about 80 px apart.
const CASES: [string, Spec][] = [
  ['every tab fits', { width: 343, content: 343, tab: { at: 250, width: 80 } }],
  ['no open tab', { width: 343, content: 760, tab: null }],
  ['no open tab, scrolled', { width: 343, content: 760, scrollLeft: 120, tab: null }],
  ['the open tab clear of both fades', { width: 343, content: 760, tab: { at: 100, width: 70 } }],
  ['the open tab past the end', { width: 343, content: 760, tab: { at: 560, width: 90 } }],
  ['the open tab under the end fade', { width: 343, content: 760, tab: { at: 270, width: 60 } }],
  ['the open tab under the start fade', { width: 343, content: 760, scrollLeft: 200, tab: { at: 215, width: 70 } }],
  ['the first tab open, scrolled away', { width: 343, content: 760, scrollLeft: 300, tab: { at: 0, width: 72 } }],
  ['the last tab open', { width: 343, content: 760, tab: { at: 680, width: 80 } }],
  ['one pixel to scroll', { width: 343, content: 344, tab: { at: 10, width: 60 } }],
  ['fractional sizes', { left: 0.5, width: 342.5, content: 761.25, tab: { at: 400.75, width: 81.5 } }],
  ['a tablet, the open tab past the end', { left: 180, width: 420, content: 690, tab: { at: 600, width: 90 } }],
];

describe('STRIP_SCRIPT matches syncStrip(ul, true)', () => {
  it.each(CASES)('%s', (_name, spec) => {
    expect(viaScript(spec)).toEqual(viaSync(spec));
  });

  it('exits quietly without a strip before it', () => {
    expect(() => new Function('document', STRIP_SCRIPT)({ currentScript: { previousElementSibling: null } })).not.toThrow();
    expect(() => new Function('document', STRIP_SCRIPT)({ currentScript: null })).not.toThrow();
  });
});

describe('syncStrip', () => {
  it('centres an open tab that is under a fade or out of view', () => {
    // At 400 of 760 (90 wide) in 343: centred is 400 - (343 - 90) / 2.
    expect(viaSync({ width: 343, content: 760, tab: { at: 400, width: 90 } })).toEqual({
      scrollLeft: 400 - (343 - 90) / 2,
      reveal: String(400 - (343 - 90) / 2),
      fade: 'start end',
    });
  });

  it('leaves an open tab that is clear of the fades where it is', () => {
    expect(viaSync({ width: 343, content: 760, tab: { at: FADE_PX, width: 70 } })).toEqual({ scrollLeft: 0, reveal: '0', fade: 'end' });
  });

  it('stops at the ends, fading only the side with more to scroll to', () => {
    expect(viaSync({ width: 343, content: 760, tab: { at: 680, width: 80 } }).fade).toBe('start');
    expect(viaSync({ width: 343, content: 760, scrollLeft: 300, tab: { at: 0, width: 72 } })).toMatchObject({ scrollLeft: 0, fade: 'end' });
    expect(viaSync({ width: 343, content: 343, tab: { at: 250, width: 80 } }).fade).toBe('');
  });
});
