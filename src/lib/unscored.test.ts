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

  it('includes games played 10 h or more on Steam, finished or not (8.1)', () => {
    const list = [
      make({ id: 'long', category: 'games', status: 'CONSUMING', playtimeMinutes: 600, updatedAt: '2026-10-05T00:00:00.000Z' }),
      make({ id: 'short', category: 'games', status: 'CONSUMING', playtimeMinutes: 599 }),
      make({ id: 'scored', category: 'games', status: 'CONSUMING', playtimeMinutes: 6000, rating: 8 }),
      make({ id: 'not-a-game', category: 'anime', status: 'CONSUMING', playtimeMinutes: 6000 }),
    ];
    expect(unscoredFinished(list).map((a) => a.id)).toEqual(['long']);
  });
});
