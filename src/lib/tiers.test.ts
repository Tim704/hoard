import { describe, expect, it } from 'vitest';
import {
  acceptSuggestions,
  buildTierBoard,
  compareTierOrder,
  isTierEligible,
  planTierSave,
  suggestTier,
  tierIndex,
} from './tiers';
import { makeActivity as make } from './test-fixtures';

describe('tier rules', () => {
  it('suggestTier thresholds', () => {
    expect(suggestTier(9)).toBe('S');
    expect(suggestTier(8.9)).toBe('A');
    expect(suggestTier(7)).toBe('B');
    expect(suggestTier(6)).toBe('C');
    expect(suggestTier(5)).toBe('D');
    expect(suggestTier(4.9)).toBe('F');
    expect(suggestTier(null)).toBeNull();
  });

  it('eligibility and index', () => {
    expect(isTierEligible('COMPLETED')).toBe(true);
    expect(isTierEligible('DROPPED')).toBe(true);
    expect(isTierEligible('PLANNED')).toBe(false);
    expect(isTierEligible('CONSUMING')).toBe(false);
    expect(tierIndex('S')).toBe(0);
    expect(tierIndex('F')).toBe(5);
    expect(tierIndex(null)).toBe(6);
  });

  it('compareTierOrder', () => {
    const list = [
      make({ id: 'z', tier: null }),
      make({ id: 'b', tier: 'A', rankOrder: 2000 }),
      make({ id: 'a', tier: 'A', rankOrder: 1000 }),
      make({ id: 's', tier: 'S', rankOrder: 5000 }),
      make({ id: 'n', tier: 'A', rankOrder: null }),
    ];
    expect([...list].sort(compareTierOrder).map((x) => x.id)).toEqual(['s', 'a', 'b', 'n', 'z']);
    const ties = [
      make({ id: 'x', rating: 7, elo: 1200 }),
      make({ id: 'y', rating: 8, elo: 1000 }),
      make({ id: 'w', rating: 8, elo: 1300 }),
    ];
    expect([...ties].sort(compareTierOrder).map((x) => x.id)).toEqual(['w', 'y', 'x']);
  });

  const board = buildTierBoard([
    make({ id: 'a', status: 'COMPLETED', tier: 'A', rankOrder: 2000 }),
    make({ id: 'b', status: 'COMPLETED', tier: 'A', rankOrder: 1000 }),
    make({ id: 'c', status: 'CONSUMING', tier: 'S', rankOrder: 1000 }),
    make({ id: 'd', status: 'DROPPED', tier: null, rankOrder: null, rating: 9 }),
    make({ id: 'e', status: 'COMPLETED', tier: null, rankOrder: 3000, rating: 4 }),
    make({ id: 'f', status: 'PLANNED', tier: null }),
  ]);

  it('buildTierBoard', () => {
    expect(board.tiers.A.map((x) => x.id)).toEqual(['b', 'a']);
    expect(board.tiers.S).toEqual([]);
    expect(board.tray.map((x) => x.id)).toEqual(['e', 'd']);
  });

  it('planTierSave never touches hidden items', () => {
    const plan = planTierSave(
      { S: [], A: ['a', 'c'], B: [], C: [], D: [], F: [] },
      new Set(['a', 'b', 'd', 'e']),
    );
    expect(plan.placed).toEqual([{ id: 'a', tier: 'A', rankOrder: 1000 }]);
    expect(plan.clearIds.sort()).toEqual(['b', 'd', 'e']);
  });

  it('planTierSave spaces ranks by 1000', () => {
    const plan = planTierSave(
      { S: ['x', 'y'], A: [], B: [], C: [], D: [], F: [] },
      new Set(['x', 'y']),
    );
    expect(plan.placed).toEqual([
      { id: 'x', tier: 'S', rankOrder: 1000 },
      { id: 'y', tier: 'S', rankOrder: 2000 },
    ]);
    expect(plan.clearIds).toEqual([]);
  });

  it('acceptSuggestions keeps tray order inside a tier', () => {
    const p = acceptSuggestions(board);
    expect(p.A).toEqual(['b', 'a']);
    expect(p.S).toEqual(['d']);
    expect(p.F).toEqual(['e']);
  });

  it('acceptSuggestions leaves unrated tray items out', () => {
    const b = buildTierBoard([make({ id: 'u', status: 'COMPLETED' })]);
    expect(Object.values(acceptSuggestions(b)).flat()).toEqual([]);
  });
});
