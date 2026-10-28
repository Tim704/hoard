import { describe, expect, it } from 'vitest';

import {
  isFinishTransition,
  planDiaryBackfill,
  planFinish,
  planImportDiary,
  todayIn,
  type BackfillCandidate,
} from './diary';

describe('todayIn (G10 day maths)', () => {
  it('00:30 in Berlin is that Berlin day, not the previous UTC day', () => {
    // 2026-03-12 00:30 CET = 2026-03-11 23:30 UTC.
    const t = new Date('2026-03-11T23:30:00Z');
    expect(todayIn('Europe/Berlin', t)).toBe('2026-03-12');
    expect(todayIn('UTC', t)).toBe('2026-03-11');
  });

  it('follows summer time (00:30 CEST = 22:30 UTC the day before)', () => {
    expect(todayIn('Europe/Berlin', new Date('2026-07-31T22:30:00Z'))).toBe('2026-08-01');
    expect(todayIn('America/New_York', new Date('2026-08-01T02:00:00Z'))).toBe('2026-07-31');
  });

  it('puts New Year 00:30 Berlin in the new year', () => {
    expect(todayIn('Europe/Berlin', new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
  });
});

describe('isFinishTransition', () => {
  it('logs moving into Completed or Retired from an unfinished status', () => {
    expect(isFinishTransition('CONSUMING', 'COMPLETED')).toBe(true);
    expect(isFinishTransition('PLANNED', 'COMPLETED')).toBe(true);
    expect(isFinishTransition('ON_HOLD', 'RETIRED')).toBe(true);
  });

  it('does not log drops, moves between finished statuses, or no change', () => {
    expect(isFinishTransition('CONSUMING', 'DROPPED')).toBe(false);
    expect(isFinishTransition('RETIRED', 'COMPLETED')).toBe(false);
    expect(isFinishTransition('DROPPED', 'COMPLETED')).toBe(false);
    expect(isFinishTransition('COMPLETED', 'COMPLETED')).toBe(false);
    expect(isFinishTransition('COMPLETED', undefined)).toBe(false);
    expect(isFinishTransition('COMPLETED', 'CONSUMING')).toBe(false);
  });
});

describe('planFinish', () => {
  const today = '2026-10-28';

  it('creates an entry with the current score and clears a rewatch', () => {
    expect(planFinish({ status: 'CONSUMING', rating: 7, rewatching: true }, { status: 'COMPLETED' }, today, null)).toEqual({
      create: { date: today, rating: 7, rewatch: true },
      clearRewatching: true,
    });
  });

  it('uses a score given in the same update', () => {
    const plan = planFinish({ status: 'PLANNED', rating: null, rewatching: false }, { status: 'COMPLETED', rating: 9 }, today, null);
    expect(plan.create).toEqual({ date: today, rating: 9, rewatch: false });
    expect(plan.clearRewatching).toBe(false);
  });

  it('"Watched, then score" rescoring today\'s entry, not older ones', () => {
    const before = { status: 'COMPLETED', rating: null, rewatching: false };
    expect(planFinish(before, { rating: 8.5 }, today, { id: 'd1', date: today, rating: null })).toEqual({
      clearRewatching: false,
      rescore: { id: 'd1', rating: 8.5 },
    });
    expect(planFinish(before, { rating: 8.5 }, today, { id: 'd1', date: '2026-10-27', rating: null }).rescore).toBeUndefined();
    expect(planFinish(before, { rating: 8.5 }, today, null).rescore).toBeUndefined();
    // Same score: nothing to do.
    expect(planFinish(before, { rating: 8.5 }, today, { id: 'd1', date: today, rating: 8.5 }).rescore).toBeUndefined();
  });

  it('does not rescore a title that is no longer finished, nor without a score change', () => {
    const before = { status: 'COMPLETED', rating: 5, rewatching: false };
    expect(planFinish(before, { status: 'CONSUMING', rating: 6 }, today, { id: 'd', date: today, rating: 5 }).rescore).toBeUndefined();
    expect(planFinish(before, { status: 'COMPLETED' }, today, { id: 'd', date: today, rating: 5 })).toEqual({ clearRewatching: false });
  });

  it('writes nothing when dropping', () => {
    expect(planFinish({ status: 'CONSUMING', rating: 3, rewatching: true }, { status: 'DROPPED' }, today, null)).toEqual({
      clearRewatching: false,
    });
  });
});

describe('planImportDiary', () => {
  it('writes the dated log, de-duplicated by day against the activity and itself', () => {
    const drafts = planImportDiary(['2024-01-05'], {
      status: 'COMPLETED',
      diary: [
        { date: '2024-03-09', rating: 8, rewatch: true, review: ' Great ' },
        { date: '2024-01-05', rewatch: false },
        { date: '2023-12-31', rewatch: false },
        { date: '2024-03-09', rating: 4, rewatch: false },
        { date: '2024-02-30', rewatch: false },
      ],
    });
    expect(drafts).toEqual([
      { date: '2023-12-31', rating: null, rewatch: false, review: null },
      { date: '2024-03-09', rating: 8, rewatch: true, review: 'Great' },
    ]);
  });

  it('falls back to one entry for the finish day', () => {
    expect(planImportDiary([], { status: 'COMPLETED', finishedOn: '2024-05-01', rating: 7, review: 'ok' })).toEqual([
      { date: '2024-05-01', rating: 7, rewatch: false, review: 'ok' },
    ]);
    expect(planImportDiary(['2024-05-01'], { status: 'COMPLETED', finishedOn: '2024-05-01' })).toEqual([]);
  });

  it('never invents entries: no dates, or a drop, writes nothing', () => {
    expect(planImportDiary([], { status: 'COMPLETED' })).toEqual([]);
    expect(planImportDiary([], { status: 'DROPPED', finishedOn: '2024-05-01' })).toEqual([]);
    expect(planImportDiary([], { status: 'COMPLETED', diary: [] })).toEqual([]);
  });
});

describe('planDiaryBackfill', () => {
  const rows: BackfillCandidate[] = [
    // 00:30 Berlin on 12 Mar = 23:30 UTC on 11 Mar.
    { id: 'a', userId: 'u', status: 'COMPLETED', finishedAt: new Date('2026-03-11T23:30:00Z'), rating: 8 },
    { id: 'b', userId: 'u', status: 'RETIRED', finishedAt: new Date('2026-04-01T12:00:00Z'), rating: null },
    { id: 'c', userId: 'u', status: 'DROPPED', finishedAt: new Date('2026-04-01T12:00:00Z'), rating: 2 },
    { id: 'd', userId: 'u', status: 'COMPLETED', finishedAt: null, rating: 5 },
  ];

  it('plans one entry per finished activity, dated in the server zone', () => {
    expect(planDiaryBackfill(rows, new Set(), 'Europe/Berlin')).toEqual([
      { userId: 'u', activityId: 'a', date: '2026-03-12', rating: 8, rewatch: false },
      { userId: 'u', activityId: 'b', date: '2026-04-01', rating: null, rewatch: false },
    ]);
  });

  it('is idempotent: a second run over the result plans nothing', () => {
    const first = planDiaryBackfill(rows, new Set(), 'Europe/Berlin');
    const done = new Set(first.map((e) => e.activityId));
    expect(planDiaryBackfill(rows, done, 'Europe/Berlin')).toEqual([]);
  });
});
