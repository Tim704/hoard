import { describe, expect, it } from 'vitest';

import { buildComparison, compatibility, pearson, type CompareEntry } from '@/lib/compare';

const e = (mediaId: string, rating: number | null, tier: string | null = null, slug: CompareEntry['slug'] = 'movies'): CompareEntry => ({
  slug,
  mediaId,
  rating,
  tier,
});

describe('pearson', () => {
  it('is 1 for a perfect positive line and -1 for a perfect negative one', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
  });

  it('matches a hand-computed value', () => {
    // x = 1..5, y = 2,4,5,4,5 → r = 6 / sqrt(10 * 6) ≈ 0.7746
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(0.7746, 4);
  });

  it('is undefined with fewer than two points or no spread', () => {
    expect(pearson([], [])).toBeNull();
    expect(pearson([5], [5])).toBeNull();
    expect(pearson([7, 7, 7], [1, 2, 3])).toBeNull();
    expect(pearson([0.1 + 0.2, 0.3, 0.3], [1, 2, 3])).toBeNull();
  });
});

describe('compatibility', () => {
  it('needs at least 5 shared scored titles', () => {
    const four: [number, number][] = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ];
    expect(compatibility(four)).toEqual({ score: null, shared: 4, reason: 'too-few' });
    expect(compatibility([])).toEqual({ score: null, shared: 0, reason: 'too-few' });
    expect(compatibility([...four, [5, 5]])).toEqual({ score: 100, shared: 5 });
  });

  it('maps r to 0–100 as round((r + 1) / 2 × 100)', () => {
    const opposite: [number, number][] = [1, 2, 3, 4, 5].map((v) => [v, 10 - v]);
    expect(compatibility(opposite).score).toBe(0);
    const pairs: [number, number][] = [
      [1, 2],
      [2, 4],
      [3, 5],
      [4, 4],
      [5, 5],
    ];
    expect(compatibility(pairs).score).toBe(89); // r ≈ 0.7746 → 88.7
  });

  it('gives no score when one side scored everything the same', () => {
    const flat: [number, number][] = [1, 2, 3, 4, 5].map((v) => [8, v]);
    expect(compatibility(flat)).toEqual({ score: null, shared: 5, reason: 'no-spread' });
  });
});

describe('buildComparison', () => {
  it('finds shared titles per section, with both scores', () => {
    const mine = [e('a', 8), e('b', null), e('c', 6), e('x', 9, 'S', 'books')];
    const theirs = [e('a', 7), e('b', 5), e('z', 4), e('x', 9, null, 'movies')];
    const c = buildComparison(mine, theirs);
    expect(c.shared).toEqual([
      { slug: 'movies', mediaId: 'a', myRating: 8, theirRating: 7 },
      { slug: 'movies', mediaId: 'b', myRating: null, theirRating: 5 },
    ]);
  });

  it('lists the top 10 disagreements by gap, both rated only, no ties of zero', () => {
    const mine: CompareEntry[] = [];
    const theirs: CompareEntry[] = [];
    for (let i = 0; i < 14; i++) {
      mine.push(e(`m${String(i).padStart(2, '0')}`, 5));
      theirs.push(e(`m${String(i).padStart(2, '0')}`, 5 + (i % 6) * 0.5));
    }
    mine.push(e('unrated', null));
    theirs.push(e('unrated', 10));
    const c = buildComparison(mine, theirs);
    expect(c.disagreements).toHaveLength(10);
    expect(c.disagreements[0].gap).toBe(2.5);
    expect(c.disagreements.every((d) => d.gap > 0)).toBe(true);
    expect(c.disagreements.some((d) => d.mediaId === 'unrated')).toBe(false);
    expect(c.disagreements.map((d) => d.gap)).toEqual([...c.disagreements.map((d) => d.gap)].sort((a, b) => b - a));
  });

  it('computes compatibility only from titles both scored', () => {
    const mine = [e('a', 1), e('b', 2), e('c', 3), e('d', 4), e('e', null)];
    const theirs = [e('a', 1), e('b', 2), e('c', 3), e('d', 4), e('e', 5)];
    expect(buildComparison(mine, theirs).compatibility).toEqual({ score: null, shared: 4, reason: 'too-few' });
  });

  it('lists their S tier titles I do not have at all', () => {
    const mine = [e('have', null)];
    const theirs = [e('have', 9, 'S'), e('missing', 9, 'S'), e('a-tier', 8, 'A'), e('missing', 9, 'S')];
    expect(buildComparison(mine, theirs).theirSMissing).toEqual([{ slug: 'movies', mediaId: 'missing' }]);
  });
});
