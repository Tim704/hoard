import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  applySectionFilters,
  DEFAULT_FILTERS,
  franchiseSections,
  isBool,
  isSortMode,
  isStatusList,
  isViewMode,
  SECTION_ORDER,
  sectionPrefKey,
  SORT_LABEL,
  SORT_MODES,
  type SectionFilters,
} from './section-filters';
import { STATUSES } from './status';
import { makeActivity } from './test-fixtures';
import type { ActivityWithMedia } from './types';

const titleOf = (m: ActivityWithMedia['media']) => m.title;
const ids = (list: ActivityWithMedia[]) => list.map((a) => a.id);
const run = (list: ActivityWithMedia[], patch: Partial<SectionFilters> = {}, text = '') =>
  ids(applySectionFilters(list, { ...DEFAULT_FILTERS, ...patch }, text, titleOf));

describe('defaults and the remembered keys', () => {
  it('defaults: every status, by status, any format, no tags, both groupings on', () => {
    expect(DEFAULT_FILTERS).toEqual({
      status: 'ALL',
      sort: 'status',
      owned: 'ALL',
      tags: [],
      groupFranchises: true,
      grouped: true,
    });
  });

  it('keeps the localStorage keys the section page has always used', () => {
    expect(sectionPrefKey('books', 'view')).toBe('hoard:books:view');
    expect(sectionPrefKey('games', 'sort')).toBe('hoard:games:sort');
    expect(sectionPrefKey('anime', 'grouped')).toBe('hoard:anime:grouped');
    expect(sectionPrefKey('music', 'franchises')).toBe('hoard:music:franchises');
    expect(sectionPrefKey('tv', 'collapsed')).toBe('hoard:tv:collapsed');
  });

  it('reads back the stored values it always wrote, and refuses junk', () => {
    for (const s of ['status', 'recent', 'rating', 'ranking', 'title']) expect(isSortMode(s)).toBe(true);
    for (const s of ['toString', '__proto__', 'Status', '', 3, null]) expect(isSortMode(s)).toBe(false);
    for (const v of ['grid', 'list', 'compact']) expect(isViewMode(v)).toBe(true);
    expect(isViewMode('table')).toBe(false);
    expect(isBool(false)).toBe(true);
    expect(isBool('false')).toBe(false);
    expect(isStatusList(['PLANNED', 'DROPPED'])).toBe(true);
    expect(isStatusList([])).toBe(true);
    expect(isStatusList(['PLANNED', 'NOPE'])).toBe(false);
    expect(isStatusList('PLANNED')).toBe(false);
  });

  it('lists the sort modes in menu order with their labels', () => {
    expect(SORT_MODES).toEqual(['status', 'recent', 'rating', 'ranking', 'title']);
    expect(SORT_LABEL.ranking).toBe('Tier list');
  });

  it('orders the status sections in progress first', () => {
    expect(SECTION_ORDER[0]).toBe('CONSUMING');
    expect([...SECTION_ORDER].sort()).toEqual([...STATUSES].sort());
  });
});

describe('activeFilterCount', () => {
  it('is 0 at the defaults', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it('counts each setting that differs from its default', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, status: 'PLANNED' })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, sort: 'recent' })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, owned: 'NONE' })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, groupFranchises: false })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, grouped: false })).toBe(1);
  });

  it('counts every selected tag', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, tags: ['cozy', 'sci-fi'] })).toBe(2);
  });

  it('adds them all up', () => {
    expect(
      activeFilterCount({ status: 'COMPLETED', sort: 'title', owned: 'Switch', tags: ['a'], groupFranchises: false, grouped: false }),
    ).toBe(6);
  });
});

describe('applySectionFilters', () => {
  const list = [
    makeActivity({ id: 'dune', status: 'COMPLETED', rating: 9, createdAt: '2026-01-03T00:00:00.000Z', tags: ['sci-fi'] }),
    makeActivity({ id: 'alien', status: 'COMPLETED', rating: 9, createdAt: '2026-01-01T00:00:00.000Z', tags: ['sci-fi', 'Horror'] }),
    makeActivity({ id: 'ubik', status: 'CONSUMING', rating: null, createdAt: '2026-01-02T00:00:00.000Z' }),
    makeActivity({ id: 'brazil', status: 'DROPPED', rating: 4, createdAt: '2026-01-05T00:00:00.000Z' }),
    makeActivity({ id: 'cats', status: 'COMPLETED', rating: null, createdAt: '2026-01-04T00:00:00.000Z' }),
  ];

  it('sorts by status, then rating (unrated last), then title, by default', () => {
    expect(run(list)).toEqual(['ubik', 'alien', 'dune', 'cats', 'brazil']);
  });

  it('sorts by newest added, highest rated, title, and tier list', () => {
    expect(run(list, { sort: 'recent' })).toEqual(['brazil', 'cats', 'dune', 'ubik', 'alien']);
    expect(run(list, { sort: 'rating' }).slice(0, 2).sort()).toEqual(['alien', 'dune']);
    expect(run(list, { sort: 'rating' }).slice(2)).toEqual(['brazil', 'ubik', 'cats']);
    expect(run(list, { sort: 'title' })).toEqual(['alien', 'brazil', 'cats', 'dune', 'ubik']);
    const tiered = [
      makeActivity({ id: 'b', tier: 'B', rankOrder: 0 }),
      makeActivity({ id: 'none' }),
      makeActivity({ id: 's', tier: 'S', rankOrder: 0 }),
    ];
    expect(run(tiered, { sort: 'ranking', grouped: false })).toEqual(['s', 'b', 'none']);
  });

  it('filters by status', () => {
    expect(run(list, { status: 'COMPLETED' })).toEqual(['alien', 'dune', 'cats']);
    expect(run(list, { status: 'ON_HOLD' })).toEqual([]);
  });

  it('filters by tags (all of them, any case)', () => {
    expect(run(list, { tags: ['SCI-FI'] })).toEqual(['alien', 'dune']);
    expect(run(list, { tags: ['sci-fi', 'horror'] })).toEqual(['alien']);
  });

  it('filters by owned platform or format', () => {
    const games = [
      makeActivity({ id: 'owned', category: 'games', ownedPlatforms: ['Switch'] }),
      makeActivity({ id: 'unowned', category: 'games' }),
    ];
    expect(run(games, { owned: 'Switch' })).toEqual(['owned']);
    expect(run(games, { owned: 'NONE' })).toEqual(['unowned']);
    expect(run(games, { owned: 'ALL' }).sort()).toEqual(['owned', 'unowned']);
  });

  it('filters by any stored title, ignoring surrounding spaces', () => {
    expect(run(list, {}, '  ALI ')).toEqual(['alien']);
    expect(run(list, {}, '   ')).toHaveLength(5);
  });

  it('puts Planned titles in Up next order when sorted or grouped by status', () => {
    // Queue: p1 before p2, although p2 was added later and sorts later by title.
    const planned = [
      makeActivity({ id: 'p2', status: 'PLANNED', queueOrder: 2000, createdAt: '2026-01-02T00:00:00.000Z' }),
      makeActivity({ id: 'p1', status: 'PLANNED', queueOrder: 1000, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeActivity({ id: 'done', status: 'COMPLETED', createdAt: '2026-01-03T00:00:00.000Z' }),
    ];
    // Grouped by status: the queue wins over "recent" for Planned titles.
    expect(run(planned, { sort: 'recent', grouped: true })).toEqual(['done', 'p1', 'p2']);
    // By status, ungrouped: the queue too (Planned sorts before Completed).
    expect(run(planned, { sort: 'status', grouped: false })).toEqual(['p1', 'p2', 'done']);
    // Neither: plain newest first.
    expect(run(planned, { sort: 'recent', grouped: false })).toEqual(['done', 'p2', 'p1']);
  });

  it('never changes the list it is given', () => {
    const copy = [...list];
    run(list, { sort: 'title' });
    expect(list).toEqual(copy);
  });
});

describe('franchiseSections', () => {
  const f = (id: string) => ({ id, name: id, imageUrl: null, rating: null });

  it('puts a franchise in its best section (in progress, else finished, …)', () => {
    const map = franchiseSections([
      makeActivity({ id: 'a', status: 'PLANNED', franchise: f('mcu') }),
      makeActivity({ id: 'b', status: 'COMPLETED', franchise: f('mcu') }),
      makeActivity({ id: 'c', status: 'DROPPED', franchise: f('lotr') }),
      makeActivity({ id: 'd', status: 'CONSUMING', franchise: f('lotr') }),
    ]);
    expect(map.get('mcu')).toBe('COMPLETED');
    expect(map.get('lotr')).toBe('CONSUMING');
  });

  it('leaves single titles and titles without a franchise alone', () => {
    const map = franchiseSections([
      makeActivity({ id: 'a', status: 'PLANNED', franchise: f('solo') }),
      makeActivity({ id: 'b', status: 'COMPLETED' }),
    ]);
    expect(map.size).toBe(0);
  });
});
