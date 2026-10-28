import { describe, expect, it } from 'vitest';

import { canCompare, rankOverlap, type QueueSlot } from './together';

describe('canCompare (the opt-in gate)', () => {
  const on = (id: string) => ({ id, compareOptIn: true });
  const off = (id: string) => ({ id, compareOptIn: false });
  it('needs both users opted in and two different users', () => {
    expect(canCompare(on('a'), on('b'))).toBe(true);
    expect(canCompare(off('a'), on('b'))).toBe(false);
    expect(canCompare(on('a'), off('b'))).toBe(false);
    expect(canCompare(on('a'), on('a'))).toBe(false);
    expect(canCompare(on('a'), null)).toBe(false);
    expect(canCompare(null, on('b'))).toBe(false);
  });
  it('treats anything but true as off', () => {
    expect(canCompare(on('a'), { id: 'b', compareOptIn: 'true' as unknown as boolean })).toBe(false);
  });
});

describe('rankOverlap', () => {
  const s = (slug: QueueSlot['slug'], mediaId: string, position: number): QueueSlot => ({ slug, mediaId, position });

  it('keeps only titles both queued (same row, same section), by combined position', () => {
    const mine = [s('movies', 'x', 1), s('movies', 'y', 2), s('movies', 'z', 3), s('tv', 'q', 1)];
    const theirs = [s('movies', 'z', 1), s('movies', 'y', 5), s('movies', 'w', 2), s('anime', 'q', 1)];
    expect(rankOverlap(mine, theirs)).toEqual([
      { slug: 'movies', mediaId: 'z', myPosition: 3, theirPosition: 1 },
      { slug: 'movies', mediaId: 'y', myPosition: 2, theirPosition: 5 },
    ]);
  });

  it('breaks ties by the better single position, then deterministically', () => {
    const mine = [s('movies', 'a', 2), s('movies', 'b', 1), s('tv', 'c', 2)];
    const theirs = [s('movies', 'a', 2), s('movies', 'b', 3), s('tv', 'c', 2)];
    expect(rankOverlap(mine, theirs).map((e) => e.mediaId)).toEqual(['b', 'a', 'c']);
  });

  it('is empty when nothing overlaps', () => {
    expect(rankOverlap([s('movies', 'a', 1)], [])).toEqual([]);
  });
});
