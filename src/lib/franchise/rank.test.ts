import { describe, expect, it } from 'vitest';

import { planFranchiseRanking } from './rank';

const owned = (o: Record<string, number | null>) => Object.entries(o).map(([id, rankOrder]) => ({ id, rankOrder }));

describe('planFranchiseRanking (writes only rows whose rank changes)', () => {
  it('a reorder from a tab that hadn’t seen F3 keeps F3 ranked, after the ones it moved', () => {
    // F3 stays at 3000 (unchanged, so not written); nothing is unranked.
    expect(planFranchiseRanking(['f2', 'f1'], [], owned({ f1: 1000, f2: 2000, f3: 3000, f4: null }))).toEqual([
      { id: 'f2', rankOrder: 1000 },
      { id: 'f1', rankOrder: 2000 },
    ]);
  });

  it('takes out only what was removed on purpose, and ignores ids that aren’t mine', () => {
    expect(planFranchiseRanking(['f1'], ['f2'], owned({ f1: 1000, f2: 2000, f3: 3000 }))).toEqual([
      { id: 'f3', rankOrder: 2000 },
      { id: 'f2', rankOrder: null },
    ]);
    expect(planFranchiseRanking(['x', 'f1'], [], owned({ f1: 1000 }))).toEqual([]);
  });
});
