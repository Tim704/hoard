import { describe, expect, it } from 'vitest';

import type { NormalizedResult } from '@/lib/types';

import { chunk, commitRowsFor, matchedItem, pendingItem, pickedInLibrary, summarise } from './review';
import type { ImportRow, RowMatch } from './types';

const hit = (externalId: string): NormalizedResult => ({
  externalId,
  title: externalId,
  year: null,
  imageUrl: null,
  subtitle: null,
  description: null,
  fields: { externalId, title: externalId },
});

const row: ImportRow = {
  source: 'letterboxd',
  category: 'movies',
  title: 'Parasite',
  year: 2019,
  ids: {},
  status: 'COMPLETED',
  rating: 9,
  finishedOn: '2024-05-31',
  tags: ['korea'],
  rewatchCount: 1,
  review: 'wow',
  diary: [{ date: '2024-05-31', rewatch: true }],
};

const match = (confidence: RowMatch['confidence'], n = 2): RowMatch => ({
  candidates: Array.from({ length: n }, (_, i) => hit(String(i))),
  chosenIndex: n ? 0 : -1,
  confidence,
  inLibrary: null,
  libraryByCandidate: Array.from({ length: n }, (_, i) => (i === 1 ? { activityId: 'a', status: 'PLANNED' as const } : null)),
});

describe('review state', () => {
  it('ticks high and medium matches, leaves low and none unticked', () => {
    expect(matchedItem(pendingItem(row), match('high')).include).toBe(true);
    expect(matchedItem(pendingItem(row), match('medium')).include).toBe(true);
    expect(matchedItem(pendingItem(row), match('low')).include).toBe(false);
    const none = matchedItem(pendingItem(row), match('none', 0));
    expect(none).toMatchObject({ include: false, chosen: -1 });
  });

  it('follows the picked candidate for "already in library"', () => {
    const item = matchedItem(pendingItem(row), match('high'));
    expect(pickedInLibrary(item)).toBeNull();
    expect(pickedInLibrary({ ...item, chosen: 1 })).toEqual({ activityId: 'a', status: 'PLANNED' });
  });

  it('sends only ticked rows with a pick, with the edited status and score and the pass-through fields', () => {
    const a = { ...matchedItem(pendingItem(row), match('high')), status: 'DROPPED' as const, rating: 4 };
    const skipped = { ...matchedItem(pendingItem(row), match('high')), chosen: -1 };
    const unticked = matchedItem(pendingItem(row), match('low'));
    expect(commitRowsFor([a, skipped, unticked])).toEqual([
      {
        category: 'movies',
        source: 'letterboxd',
        result: hit('0'),
        status: 'DROPPED',
        rating: 4,
        finishedOn: '2024-05-31',
        tags: ['korea'],
        rewatchCount: 1,
        review: 'wow',
        diary: [{ date: '2024-05-31', rewatch: true }],
      },
    ]);
  });

  it('summarises outcomes', () => {
    expect(
      summarise(6, [{ outcome: 'added' }, { outcome: 'added' }, { outcome: 'updated' }, { outcome: 'unchanged' }, { outcome: 'failed' }]),
    ).toEqual({ added: 2, updated: 1, unchanged: 1, failed: 1, skipped: 1 });
  });

  it('chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
