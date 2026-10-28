import { describe, expect, it } from 'vitest';

import {
  applyChallengeResult,
  bucketPair,
  challengeKey,
  challengePairs,
  fewestDuelsPair,
  parseChallengeHistory,
} from './arena-pick';
import type { Tier } from './tiers';

const d = (id: string, duels: number) => ({ id, duels });

/** A deterministic "random" sequence. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('fewestDuelsPair', () => {
  it('prefers the pair with the fewest combined duels', () => {
    const pairs = [
      [d('a', 5), d('b', 5)],
      [d('c', 1), d('d', 2)],
      [d('e', 0), d('f', 9)],
    ] as const;
    expect(fewestDuelsPair(pairs, () => 0.99)?.map((x) => x.id)).toEqual(['c', 'd']);
  });

  it('breaks ties at random', () => {
    const pairs = [
      [d('a', 1), d('b', 1)],
      [d('c', 0), d('d', 2)],
      [d('e', 4), d('f', 4)],
    ] as const;
    expect(fewestDuelsPair(pairs, () => 0)?.[0].id).toBe('a');
    expect(fewestDuelsPair(pairs, () => 0.99)?.[0].id).toBe('c');
  });

  it('returns null without pairs', () => {
    expect(fewestDuelsPair([])).toBeNull();
  });
});

describe('bucketPair', () => {
  it('pairs the two least-dueled titles', () => {
    const pair = bucketPair([d('a', 3), d('b', 0), d('c', 7), d('d', 1)], () => 0.5);
    expect(pair?.map((x) => x.id)).toEqual(['b', 'd']);
  });

  it('shuffles titles with equal duels', () => {
    const items = [d('a', 0), d('b', 0), d('c', 0)];
    expect(bucketPair(items, seq(0.9, 0.1, 0.5))?.map((x) => x.id)).toEqual(['b', 'c']);
    expect(bucketPair(items, seq(0.1, 0.9, 0.5))?.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('needs two titles', () => {
    expect(bucketPair([d('a', 0)])).toBeNull();
  });
});

describe('challengePairs', () => {
  const tiers = (over: Partial<Record<Tier, string[]>>): Record<Tier, string[]> => ({
    S: [],
    A: [],
    B: [],
    C: [],
    D: [],
    F: [],
    ...over,
  });

  it('pairs the bottom of each tier with the top of the next non-empty tier', () => {
    const pairs = challengePairs(tiers({ S: ['s1', 's2'], A: ['a1'], C: ['c1', 'c2', 'c3'], F: ['f1'] }));
    expect(pairs).toEqual([
      { upper: 's2', lower: 'a1', upperTier: 'S', lowerTier: 'A' },
      { upper: 'a1', lower: 'c1', upperTier: 'A', lowerTier: 'C' },
      { upper: 'c3', lower: 'f1', upperTier: 'C', lowerTier: 'F' },
    ]);
  });

  it('has nothing to challenge with fewer than two filled tiers', () => {
    expect(challengePairs(tiers({ B: ['b1', 'b2'] }))).toEqual([]);
    expect(challengePairs(tiers({}))).toEqual([]);
  });
});

describe('applyChallengeResult', () => {
  const pair = { upperId: 'up', lowerId: 'low' };

  it('suggests a move once the lower title wins the same pairing twice', () => {
    const first = applyChallengeResult({}, pair, 'low');
    expect(first).toEqual({ history: { [challengeKey('up', 'low')]: 1 }, suggest: false });
    const second = applyChallengeResult(first.history, pair, 'low');
    expect(second.suggest).toBe(true);
    // The count starts over, so a dismissed suggestion needs two more wins.
    expect(second.history).toEqual({});
  });

  it('upper wins change nothing', () => {
    const h = { [challengeKey('up', 'low')]: 1 };
    expect(applyChallengeResult(h, pair, 'up')).toEqual({ history: h, suggest: false });
  });

  it('counts each pairing separately', () => {
    const h = applyChallengeResult({}, { upperId: 'x', lowerId: 'low' }, 'low').history;
    expect(applyChallengeResult(h, pair, 'low').suggest).toBe(false);
  });
});

describe('parseChallengeHistory', () => {
  it('keeps well-formed entries only', () => {
    expect(
      parseChallengeHistory({ 'a>b': 1, 'c>d': 0, bad: 1, 'e>f': -1, 'g>h': 1.5, 'i>j': 'x', 'k>l': 99 }),
    ).toEqual({ 'a>b': 1, 'c>d': 0 });
  });
  it('ignores non-objects', () => {
    expect(parseChallengeHistory(null)).toEqual({});
    expect(parseChallengeHistory([1])).toEqual({});
    expect(parseChallengeHistory('a>b')).toEqual({});
  });
});
