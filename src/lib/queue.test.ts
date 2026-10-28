import { describe, expect, it } from 'vitest';

import { mergeAvailableOrder, nextQueueOrder, orderQueue, splitQueue } from './queue';
import { makeActivity as make } from './test-fixtures';

describe('orderQueue', () => {
  it('keeps PLANNED only: legacy nulls first (oldest first), then queueOrder asc', () => {
    expect(
      orderQueue([
        make({ id: 'x', status: 'PLANNED', queueOrder: null, createdAt: '2026-01-02' }),
        make({ id: 'y', status: 'PLANNED', queueOrder: 2000 }),
        make({ id: 'z', status: 'PLANNED', queueOrder: 1000 }),
        make({ id: 'w', status: 'COMPLETED', queueOrder: 500 }),
        make({ id: 'v', status: 'PLANNED', queueOrder: null, createdAt: '2026-01-01' }),
      ]).map((a) => a.id),
    ).toEqual(['v', 'x', 'z', 'y']);
  });

  it('a new item joining after legacy null rows lands last', () => {
    expect(
      orderQueue([
        make({ id: 'new', status: 'PLANNED', queueOrder: nextQueueOrder(null), createdAt: '2026-10-27' }),
        make({ id: 'old2', status: 'PLANNED', queueOrder: null, createdAt: '2025-02-01' }),
        make({ id: 'old1', status: 'PLANNED', queueOrder: null, createdAt: '2025-01-01' }),
      ]).map((a) => a.id),
    ).toEqual(['old1', 'old2', 'new']);
  });

  it('breaks equal queueOrder ties by createdAt, then id', () => {
    expect(
      orderQueue([
        make({ id: 'c', status: 'PLANNED', queueOrder: 1000, createdAt: '2026-01-01' }),
        make({ id: 'b', status: 'PLANNED', queueOrder: 1000, createdAt: '2026-01-02' }),
        make({ id: 'a', status: 'PLANNED', queueOrder: 1000, createdAt: '2026-01-02' }),
        make({ id: 'n2', status: 'PLANNED', queueOrder: null, createdAt: '2026-01-01' }),
        make({ id: 'n1', status: 'PLANNED', queueOrder: null, createdAt: '2026-01-01' }),
      ]).map((a) => a.id),
    ).toEqual(['n1', 'n2', 'c', 'a', 'b']);
  });
});

describe('nextQueueOrder', () => {
  it('starts at 1000 and steps by 1000', () => {
    expect(nextQueueOrder(null)).toBe(1000);
    expect(nextQueueOrder(3000)).toBe(4000);
  });
});

describe('splitQueue (5.4)', () => {
  const today = '2026-10-28';
  const q = [
    make({ id: 'a', media: { id: 'ma', externalId: 'a', title: 'a', imageUrl: null, description: null, year: 2020 } }),
    make({ id: 'b', media: { id: 'mb', externalId: 'b', title: 'b', imageUrl: null, description: null, year: 2027 } }),
    make({ id: 'c', media: { id: 'mc', externalId: 'c', title: 'c', imageUrl: null, description: null, year: 2026, releaseDate: '2026-12-01' } }),
    make({ id: 'd', media: { id: 'md', externalId: 'd', title: 'd', imageUrl: null, description: null, year: 2026, releaseDate: '2026-10-28' } }),
    make({ id: 'e', media: { id: 'me', externalId: 'e', title: 'e', imageUrl: null, description: null, year: 2027, releaseDate: '2027-01-05' } }),
    make({ id: 'f', media: { id: 'mf', externalId: 'f', title: 'f', imageUrl: null, description: null, year: null } }),
  ];
  it('keeps out titles in queue order and sorts the rest soonest first', () => {
    const { available, notYet } = splitQueue(q, today);
    expect(available.map((a) => a.id)).toEqual(['a', 'd', 'f']);
    expect(notYet.map((a) => a.id)).toEqual(['c', 'e', 'b']);
  });
});

describe('mergeAvailableOrder', () => {
  it('refills only the available slots; not-out-yet titles keep theirs', () => {
    expect(mergeAvailableOrder(['a', 'X', 'b', 'c', 'Y'], ['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([
      'c',
      'X',
      'a',
      'b',
      'Y',
    ]);
  });
  it('ignores unknown ids and keeps missing available ones after the given', () => {
    expect(mergeAvailableOrder(['a', 'X', 'b', 'c'], ['a', 'b', 'c'], ['zz', 'b', 'X'])).toEqual(['b', 'X', 'a', 'c']);
  });
});
