import { describe, expect, it } from 'vitest';
import {
  acceptSuggestions,
  boardPlacement,
  buildTierBoard,
  compareTierOrder,
  findContainer,
  isTierEligible,
  moveItem,
  parseTierSave,
  planTierSave,
  resolveDrop,
  suggestTier,
  tierIndex,
  withinTierPairs,
  type Tier,
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

  type Cur = { tier: Tier | null; rankOrder: number | null };
  const cur = (entries: Record<string, Cur>) => new Map(Object.entries(entries));
  const empty = { S: [], A: [], B: [], C: [], D: [], F: [] };
  const unplaced: Cur = { tier: null, rankOrder: null };

  it('planTierSave never touches hidden items', () => {
    const plan = planTierSave(
      { ...empty, A: ['a', 'c'] },
      ['b', 'd', 'e', 'c2'],
      cur({
        a: unplaced,
        b: { tier: 'B', rankOrder: 1000 },
        d: { tier: 'S', rankOrder: 1000 },
        e: { tier: 'F', rankOrder: 1000 },
      }),
    );
    expect(plan.placed).toEqual([{ id: 'a', tier: 'A', rankOrder: 1000 }]);
    expect(plan.clearIds.sort()).toEqual(['b', 'd', 'e']);
  });

  it('planTierSave spaces ranks by 1000', () => {
    const plan = planTierSave({ ...empty, S: ['x', 'y'] }, [], cur({ x: unplaced, y: unplaced }));
    expect(plan.placed).toEqual([
      { id: 'x', tier: 'S', rankOrder: 1000 },
      { id: 'y', tier: 'S', rankOrder: 2000 },
    ]);
    expect(plan.clearIds).toEqual([]);
  });

  it('planTierSave only writes rows whose tier or rank changed', () => {
    const plan = planTierSave(
      { ...empty, S: ['x', 'y', 'z'], A: ['w'] },
      [],
      cur({
        x: { tier: 'S', rankOrder: 1000 }, // unchanged
        y: { tier: 'S', rankOrder: 3000 }, // rank changed
        z: { tier: 'A', rankOrder: 3000 }, // tier changed
        w: { tier: 'A', rankOrder: 1000 }, // unchanged
      }),
    );
    expect(plan.placed).toEqual([
      { id: 'y', tier: 'S', rankOrder: 2000 },
      { id: 'z', tier: 'S', rankOrder: 3000 },
    ]);
  });

  it('planTierSave clears only eligible tiered ids the client shows in the tray', () => {
    const plan = planTierSave(
      { ...empty, A: ['a'] },
      ['t', 'u', 'a'],
      cur({
        a: { tier: 'B', rankOrder: 1000 }, // placed wins over a duplicate tray listing
        t: { tier: 'C', rankOrder: 1000 }, // shown in tray → cleared
        u: { tier: null, rankOrder: 4000 }, // already untiered → left alone
        stale: { tier: 'S', rankOrder: 1000 }, // absent from both (other tab) → untouched
      }),
    );
    expect(plan.placed).toEqual([{ id: 'a', tier: 'A', rankOrder: 1000 }]);
    expect(plan.clearIds).toEqual(['t']);
  });

  it('parseTierSave accepts a well-formed payload', () => {
    expect(parseTierSave({ ...empty, S: ['x'] }, ['y'])).toEqual({
      placement: { ...empty, S: ['x'] },
      trayIds: ['y'],
    });
  });

  it('parseTierSave rejects malformed payloads', () => {
    expect(parseTierSave(null, [])).toBeNull();
    expect(parseTierSave({ S: [], A: [], B: [], C: [], D: [] }, [])).toBeNull();
    expect(parseTierSave({ ...empty, S: 'x' }, [])).toBeNull();
    expect(parseTierSave({ ...empty, S: [1] }, [])).toBeNull();
    expect(parseTierSave(empty, null)).toBeNull();
    expect(parseTierSave(empty, [2])).toBeNull();
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
