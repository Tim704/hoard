import { describe, expect, it } from 'vitest';

import { nextQueueOrder, orderQueue } from './queue';
import { makeActivity as make } from './test-fixtures';

describe('orderQueue', () => {
  it('keeps PLANNED only, by queueOrder asc, nulls last by createdAt', () => {
    expect(
      orderQueue([
        make({ id: 'x', status: 'PLANNED', queueOrder: null, createdAt: '2026-01-02' }),
        make({ id: 'y', status: 'PLANNED', queueOrder: 2000 }),
        make({ id: 'z', status: 'PLANNED', queueOrder: 1000 }),
        make({ id: 'w', status: 'COMPLETED', queueOrder: 500 }),
        make({ id: 'v', status: 'PLANNED', queueOrder: null, createdAt: '2026-01-01' }),
      ]).map((a) => a.id),
    ).toEqual(['z', 'y', 'v', 'x']);
  });
});

describe('nextQueueOrder', () => {
  it('starts at 1000 and steps by 1000', () => {
    expect(nextQueueOrder(null)).toBe(1000);
    expect(nextQueueOrder(3000)).toBe(4000);
  });
});
