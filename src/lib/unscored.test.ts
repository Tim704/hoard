import { describe, expect, it } from 'vitest';
import { packUnscored, unpackUnscored, unscoredFinished } from './unscored';
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

describe('packUnscored / unpackUnscored', () => {
  const onBoard = [make({ id: 'a', status: 'COMPLETED' }), make({ id: 'b', status: 'DROPPED' }), make({ id: 'c', status: 'COMPLETED', rating: 8 })];
  const game = make({ id: 'g', category: 'games', status: 'CONSUMING', playtimeMinutes: 900 });

  it('sends a title on the board as its id, any other whole', () => {
    expect(packUnscored([onBoard[1], game, onBoard[0]], onBoard)).toEqual(['b', game, 'a']);
  });

  it('round-trips in order, to the board’s own objects', () => {
    const packed = packUnscored([onBoard[1], game, onBoard[0]], onBoard);
    const back = unpackUnscored(packed, onBoard);
    expect(back.map((a) => a.id)).toEqual(['b', 'g', 'a']);
    expect(back[0]).toBe(onBoard[1]);
  });

  it('skips an id the board no longer has', () => {
    expect(unpackUnscored(['x', 'a'], onBoard).map((a) => a.id)).toEqual(['a']);
    expect(unpackUnscored([], onBoard)).toEqual([]);
  });
});
