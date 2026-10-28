import { describe, expect, it } from 'vitest';

import type { NormalizedResult } from '@/lib/types';

import {
  chunk,
  chunkCommitRows,
  COMMIT_BYTES,
  commitRowsFor,
  fitRow,
  matchedItem,
  matchPayload,
  pendingItem,
  pickedInLibrary,
  summarise,
} from './review';
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

describe('payload sizes', () => {
  const commit = (review = '', diaryReviews = 0) =>
    commitRowsFor([
      matchedItem(
        pendingItem({
          ...row,
          review: review || undefined,
          diary: Array.from({ length: diaryReviews }, (_, i) => ({ date: '2024-01-01', rewatch: i > 0, review: 'r'.repeat(20_000) })),
        }),
        match('high'),
      ),
    ])[0];

  it('matching never sends reviews, diaries or notes', () => {
    const out = matchPayload({ ...row, notes: 'n' });
    expect(out).not.toHaveProperty('review');
    expect(out).not.toHaveProperty('diary');
    expect(out).not.toHaveProperty('notes');
    expect(out.title).toBe('Parasite');
  });

  it('chunks commits by count and by size', () => {
    const small = Array.from({ length: 45 }, () => commit());
    expect(chunkCommitRows(small, 20).map((c) => c.length)).toEqual([20, 20, 5]);
    const big = Array.from({ length: 6 }, () => commit('x'.repeat(19_000), 10)); // ~220 KB each
    const chunks = chunkCommitRows(big, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThan(COMMIT_BYTES);
    expect(chunks.flat()).toHaveLength(6);
  });

  it('shrinks a single oversized row instead of failing it', () => {
    const huge = commit('x'.repeat(20_000), 60); // ~1.2 MB of diary reviews
    const fitted = fitRow(huge);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(COMMIT_BYTES);
    expect(fitted.review).toHaveLength(20_000);
    expect(fitted.diary!.length).toBe(60); // reviews cut to 2,000 characters were enough
    expect(fitted.diary![0].review).toHaveLength(2000);
    expect(fitRow(commit())).toEqual(commit());
  });
});
