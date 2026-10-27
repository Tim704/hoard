import { describe, expect, it } from 'vitest';
import {
  acceptSuggestions,
  boardPlacement,
  buildTierBoard,
  compareTierOrder,
  findContainer,
  isTierEligible,
  moveItem,
  planTierSave,
  resolveDrop,
  suggestTier,
  tierIndex,
  withinTierPairs,
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

  it('withinTierPairs pairs neighbours inside a tier only', () => {
    const b = buildTierBoard([
      make({ id: 'a', tier: 'A', rankOrder: 2000 }),
      make({ id: 'b', tier: 'A', rankOrder: 1000 }),
      make({ id: 'x', tier: 'B', rankOrder: 1000 }),
    ]);
    expect(withinTierPairs(b).map(([p, q]) => [p.id, q.id])).toEqual([['b', 'a']]);
  });

  it('withinTierPairs yields every neighbour pair, S first', () => {
    const b = buildTierBoard([
      make({ id: 's1', tier: 'S', rankOrder: 1000 }),
      make({ id: 's2', tier: 'S', rankOrder: 2000 }),
      make({ id: 's3', tier: 'S', rankOrder: 3000 }),
      make({ id: 'f1', tier: 'F', rankOrder: 1000 }),
      make({ id: 'f2', tier: 'F', rankOrder: 2000 }),
    ]);
    expect(withinTierPairs(b).map(([p, q]) => [p.id, q.id])).toEqual([
      ['s1', 's2'],
      ['s2', 's3'],
      ['f1', 'f2'],
    ]);
  });

  describe('board editing', () => {
    const ids = (b: ReturnType<typeof buildTierBoard>) => ({
      ...boardPlacement(b),
      tray: b.tray.map((x) => x.id),
    });

    it('findContainer locates tiers and the tray', () => {
      expect(findContainer(board, 'a')).toBe('A');
      expect(findContainer(board, 'd')).toBe('tray');
      expect(findContainer(board, 'c')).toBeNull(); // hidden (CONSUMING)
      expect(findContainer(board, 'nope')).toBeNull();
    });

    it('moveItem moves across containers, appending by default', () => {
      const next = moveItem(board, 'd', 'A');
      expect(ids(next).A).toEqual(['b', 'a', 'd']);
      expect(ids(next).tray).toEqual(['e']);
      // the original board is untouched
      expect(board.tray.map((x) => x.id)).toEqual(['e', 'd']);
    });

    it('moveItem inserts at an index and back into the tray', () => {
      expect(ids(moveItem(board, 'e', 'A', 0)).A).toEqual(['e', 'b', 'a']);
      const back = moveItem(board, 'a', 'tray', 0);
      expect(ids(back).A).toEqual(['b']);
      expect(ids(back).tray).toEqual(['a', 'e', 'd']);
    });

    it('moveItem reorders within a container like arrayMove', () => {
      expect(ids(moveItem(board, 'b', 'A', 1)).A).toEqual(['a', 'b']);
      expect(ids(moveItem(board, 'a', 'A', 0)).A).toEqual(['a', 'b']);
      expect(ids(moveItem(board, 'b', 'A', 99)).A).toEqual(['a', 'b']);
    });

    it('moveItem ignores unknown ids', () => {
      expect(moveItem(board, 'nope', 'S')).toBe(board);
    });

    it('boardPlacement lists tier ids in order and ignores the tray', () => {
      expect(boardPlacement(board)).toEqual({ S: [], A: ['b', 'a'], B: [], C: [], D: [], F: [] });
    });

    it('resolveDrop handles containers and items', () => {
      expect(resolveDrop(board, 'S')).toEqual({ container: 'S', index: 0 });
      expect(resolveDrop(board, 'A')).toEqual({ container: 'A', index: 2 });
      expect(resolveDrop(board, 'tray')).toEqual({ container: 'tray', index: 2 });
      expect(resolveDrop(board, 'a')).toEqual({ container: 'A', index: 1 });
      expect(resolveDrop(board, 'd')).toEqual({ container: 'tray', index: 1 });
      expect(resolveDrop(board, 'nope')).toBeNull();
    });
  });
});
