import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSaveBatcher, type Burst } from './save-batch';

type Key = 'layout' | 'titleView';

function setup(delay = 400) {
  const flushed: Array<[Key, Burst<string>]> = [];
  const batcher = createSaveBatcher<Key, string>({ delay, flush: (key, burst) => flushed.push([key, burst]) });
  return { batcher, flushed };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createSaveBatcher', () => {
  it('saves a burst once, with its last value, after the key is still for the delay', () => {
    const { batcher, flushed } = setup();
    expect(batcher.push('layout', 'classic', 'minimal')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(batcher.push('layout', 'minimal', 'organised')).toBe(false);
    vi.advanceTimersByTime(300);
    expect(batcher.push('layout', 'organised', 'fresh')).toBe(false);
    expect(flushed).toEqual([]);
    expect(batcher.isScheduled('layout')).toBe(true);
    vi.advanceTimersByTime(399);
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(flushed).toEqual([['layout', { value: 'fresh', before: 'classic' }]]);
    expect(batcher.isScheduled('layout')).toBe(false);
  });

  it('remembers the value from before the burst (for Undo), even when it ends where it began', () => {
    const { batcher, flushed } = setup();
    batcher.push('layout', 'classic', 'minimal');
    batcher.push('layout', 'minimal', 'classic');
    vi.advanceTimersByTime(400);
    expect(flushed).toEqual([['layout', { value: 'classic', before: 'classic' }]]);
  });

  it('starts a new burst after a save went out', () => {
    const { batcher, flushed } = setup();
    batcher.push('layout', 'classic', 'minimal');
    vi.advanceTimersByTime(400);
    expect(batcher.push('layout', 'minimal', 'fresh')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(flushed).toEqual([
      ['layout', { value: 'minimal', before: 'classic' }],
      ['layout', { value: 'fresh', before: 'minimal' }],
    ]);
  });

  it('keeps each key on its own timer', () => {
    const { batcher, flushed } = setup();
    batcher.push('layout', 'classic', 'fresh');
    vi.advanceTimersByTime(300);
    batcher.push('titleView', 'popup', 'page');
    vi.advanceTimersByTime(100);
    expect(flushed).toEqual([['layout', { value: 'fresh', before: 'classic' }]]);
    expect(batcher.isScheduled('titleView')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(flushed.at(-1)).toEqual(['titleView', { value: 'page', before: 'popup' }]);
  });

  it('flushAll saves every waiting burst now, once', () => {
    const { batcher, flushed } = setup();
    batcher.push('layout', 'classic', 'fresh');
    batcher.push('titleView', 'popup', 'page');
    batcher.flushAll();
    expect(flushed).toEqual([
      ['layout', { value: 'fresh', before: 'classic' }],
      ['titleView', { value: 'page', before: 'popup' }],
    ]);
    vi.advanceTimersByTime(1000);
    expect(flushed).toHaveLength(2);
    expect(batcher.isScheduled('layout')).toBe(false);
  });
});
