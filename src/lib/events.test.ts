import { describe, expect, it } from 'vitest';

import { eventsForUpdate, queueMoveEvent, scoreValue, tierEvents } from './events';

const ids = { userId: 'u1', activityId: 'a1' };

describe('eventsForUpdate', () => {
  it('records a status change', () => {
    expect(eventsForUpdate(ids, { status: 'PLANNED', rating: null }, { status: 'CONSUMING' })).toEqual([
      { ...ids, kind: 'status', from: 'PLANNED', to: 'CONSUMING' },
    ]);
  });

  it('records a score change, including set and clear', () => {
    expect(eventsForUpdate(ids, { status: 'COMPLETED', rating: null }, { rating: 8.5 })).toEqual([
      { ...ids, kind: 'score', from: null, to: '8.5' },
    ]);
    expect(eventsForUpdate(ids, { status: 'COMPLETED', rating: 7 }, { rating: null })).toEqual([
      { ...ids, kind: 'score', from: '7', to: null },
    ]);
  });

  it('records both when finishing with a score', () => {
    const e = eventsForUpdate(ids, { status: 'CONSUMING', rating: null }, { status: 'COMPLETED', rating: 9 });
    expect(e.map((x) => x.kind)).toEqual(['status', 'score']);
  });

  it('records nothing for unchanged or absent fields', () => {
    expect(eventsForUpdate(ids, { status: 'COMPLETED', rating: 8 }, { status: 'COMPLETED', rating: 8 })).toEqual([]);
    expect(eventsForUpdate(ids, { status: 'COMPLETED', rating: 8 }, {})).toEqual([]);
    // float drift does not count as a change
    expect(eventsForUpdate(ids, { status: 'COMPLETED', rating: 0.1 + 0.2 }, { rating: 0.3 })).toEqual([]);
  });
});

describe('scoreValue', () => {
  it('stores one decimal as a string', () => {
    expect(scoreValue(8)).toBe('8');
    expect(scoreValue(7.25)).toBe('7.3');
    expect(scoreValue(null)).toBeNull();
  });
});

describe('tierEvents', () => {
  it('keeps only real tier changes and tags them', () => {
    expect(
      tierEvents(
        'u1',
        [
          { activityId: 'a', from: null, to: 'S' },
          { activityId: 'b', from: 'A', to: 'A' },
          { activityId: 'c', from: 'B', to: null },
        ],
        { via: 'suggestions' },
      ),
    ).toEqual([
      { userId: 'u1', activityId: 'a', kind: 'tier', from: null, to: 'S', meta: { via: 'suggestions' } },
      { userId: 'u1', activityId: 'c', kind: 'tier', from: 'B', to: null, meta: { via: 'suggestions' } },
    ]);
  });
});

describe('queueMoveEvent', () => {
  it('is null when nothing moved', () => {
    expect(queueMoveEvent('u1', ['a', 'b', 'c'], ['a', 'b', 'c'])).toBeNull();
    expect(queueMoveEvent('u1', ['a', 'b', 'c'], ['a', 'c'])).toBeNull();
  });

  it('names the dragged item and its positions', () => {
    expect(queueMoveEvent('u1', ['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c'])).toEqual({
      userId: 'u1',
      activityId: 'd',
      kind: 'queue',
      from: '4',
      to: '1',
      meta: { moved: 1 },
    });
    expect(queueMoveEvent('u1', ['a', 'b', 'c', 'd'], ['b', 'c', 'a', 'd'])).toMatchObject({
      activityId: 'a',
      from: '1',
      to: '3',
    });
  });

  it('writes one event even when several items moved', () => {
    const e = queueMoveEvent('u1', ['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a']);
    expect(e).toMatchObject({ kind: 'queue', meta: { moved: 4 } });
  });
});
