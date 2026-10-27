import { describe, expect, it } from 'vitest';

import { nextQueueOrder, orderQueue } from './queue';
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
