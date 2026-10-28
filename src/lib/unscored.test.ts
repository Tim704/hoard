import { describe, expect, it } from 'vitest';
import { unscoredFinished } from './unscored';
import { makeActivity as make } from './test-fixtures';

describe('unscoredFinished', () => {
  it('keeps finished titles without a score, newest first', () => {
    const list = [
      make({ id: 'done', status: 'COMPLETED', updatedAt: '2026-10-01T00:00:00.000Z' }),
      make({ id: 'scored', status: 'COMPLETED', rating: 7 }),
      make({ id: 'zero', status: 'COMPLETED', rating: 0 }),
      make({ id: 'retired', status: 'RETIRED', updatedAt: '2026-10-03T00:00:00.000Z' }),
      make({ id: 'dropped', status: 'DROPPED', updatedAt: '2026-10-02T00:00:00.000Z' }),
      make({ id: 'paused', status: 'ON_HOLD' }),
      make({ id: 'planned', status: 'PLANNED' }),
      make({ id: 'ongoing', status: 'CONSUMING' }),
    ];
    expect(unscoredFinished(list).map((a) => a.id)).toEqual(['retired', 'dropped', 'done']);
  });

  it('is empty when everything is scored', () => {
    expect(unscoredFinished([make({ id: 'a', rating: 5 })])).toEqual([]);
  });
});
