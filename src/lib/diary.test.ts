import { describe, expect, it } from 'vitest';

import {
  applyDiaryForUpdate,
  importReviewNote,
  isFinishTransition,
  touchesDiary,
  undoDiaryForRestore,
  writeImportDiary,
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

  it('writes no entry when dropping, but a drop still ends a repeat run', () => {
    expect(planFinish({ status: 'CONSUMING', rating: 3, rewatching: true }, { status: 'DROPPED' }, today, null)).toEqual({
      clearRewatching: true,
    });
    expect(planFinish({ status: 'CONSUMING', rating: 3, rewatching: false }, { status: 'DROPPED' }, today, null)).toEqual({
      clearRewatching: false,
    });
    // Any finished status ends it; leaving it unfinished does not.
    expect(planFinish({ status: 'ON_HOLD', rating: null, rewatching: true }, { status: 'RETIRED' }, today, null).clearRewatching).toBe(true);
    expect(planFinish({ status: 'CONSUMING', rating: null, rewatching: true }, { status: 'ON_HOLD' }, today, null).clearRewatching).toBe(false);
  });

  it('knows when an update touches the diary', () => {
    expect(touchesDiary({ status: 'CONSUMING', rewatching: false }, { status: 'COMPLETED' })).toBe(true);
    expect(touchesDiary({ status: 'CONSUMING', rewatching: false }, { rating: 5 })).toBe(true);
    expect(touchesDiary({ status: 'CONSUMING', rewatching: true }, { status: 'DROPPED' })).toBe(true);
    expect(touchesDiary({ status: 'CONSUMING', rewatching: false }, { status: 'DROPPED' })).toBe(false);
    expect(touchesDiary({ status: 'PLANNED', rewatching: false }, { status: 'CONSUMING' })).toBe(false);
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

describe('importReviewNote', () => {
  it('keeps a review no entry holds in the notes, once', () => {
    expect(importReviewNote(null, 'Loved it', 'goodreads', [])).toBe('Review (Goodreads): Loved it');
    expect(importReviewNote('My notes', ' Loved it ', 'storygraph', [])).toBe('My notes\n\nReview (StoryGraph): Loved it');
    // Already there (a second import), or held by a diary entry: nothing to do.
    expect(importReviewNote('Review (Goodreads): Loved it', 'Loved it', 'goodreads', [])).toBeNull();
    expect(importReviewNote(null, 'Loved it', 'letterboxd', [{ review: 'Loved it' }])).toBeNull();
    expect(importReviewNote(null, '  ', 'goodreads', [])).toBeNull();
    expect(importReviewNote(null, undefined, 'goodreads', [])).toBeNull();
    expect(importReviewNote(null, 'x', 'generic', [])).toBe('Review (CSV): x');
  });
});

// ── The writers, over a tiny in-memory transaction ──────────────────────────

interface Entry {
  id: string;
  userId: string;
  activityId: string;
  date: string;
  rating: number | null;
  rewatch: boolean;
  review: string | null;
  createdAt: Date;
}

function fakeTx(activity: { id: string; userId: string; notes?: string | null; rewatching?: boolean }, entries: Entry[] = []) {
  let n = 0;
  const act = { notes: null as string | null, rewatching: false, ...activity };
  const match = (e: Entry, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => (e as any)[k] === v);
  const newest = (list: Entry[]) =>
    [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const tx = {
    diaryEntry: {
      create: async ({ data }: any) => {
        const e = { id: `d${++n}`, rating: null, rewatch: false, review: null, createdAt: new Date(), ...data };
        entries.push(e);
        return e;
      },
      createMany: async ({ data }: any) => {
        for (const d of data) entries.push({ id: `d${++n}`, rating: null, rewatch: false, review: null, createdAt: new Date(), ...d });
      },
      findMany: async ({ where }: any) => entries.filter((e) => match(e, where)),
      findFirst: async ({ where }: any) => newest(entries.filter((e) => match(e, where))),
      update: async ({ where, data }: any) => Object.assign(entries.find((e) => e.id === where.id)!, data),
      deleteMany: async ({ where }: any) => {
        const keep = entries.filter((e) => !match(e, where));
        const count = entries.length - keep.length;
        entries.splice(0, entries.length, ...keep);
        return { count };
      },
    },
    userMediaActivity: {
      findUnique: async () => act,
      update: async ({ data }: any) => Object.assign(act, data),
    },
  };
  return { tx: tx as any, entries, act };
}

const berlin = { timeZone: 'Europe/Berlin' };
const now = new Date('2026-10-28T10:00:00Z');

describe('applyDiaryForUpdate / undoDiaryForRestore', () => {
  it('reports the entry a finish wrote, and Undo deletes exactly that one', async () => {
    const old: Entry = { id: 'old', userId: 'u', activityId: 'a', date: '2026-10-28', rating: 5, rewatch: false, review: null, createdAt: now };
    const { tx, entries } = fakeTx({ id: 'a', userId: 'u' }, [old]);
    const before = { id: 'a', userId: 'u', status: 'CONSUMING', rating: 7, rewatching: false };
    const { diaryEntryId } = await applyDiaryForUpdate(tx, before, { status: 'COMPLETED' }, berlin, now);
    expect(diaryEntryId).toBeDefined();
    expect(entries).toHaveLength(2);

    // Someone else's id, or this id on another activity, deletes nothing.
    await undoDiaryForRestore(tx, { userId: 'u2', activityId: 'a' }, { status: 'CONSUMING', ratingBefore: 7 }, diaryEntryId, berlin, now);
    await undoDiaryForRestore(tx, { userId: 'u', activityId: 'b' }, { status: 'CONSUMING', ratingBefore: 7 }, diaryEntryId, berlin, now);
    expect(entries).toHaveLength(2);
    await undoDiaryForRestore(tx, { userId: 'u', activityId: 'a' }, { status: 'CONSUMING', ratingBefore: 7 }, diaryEntryId, berlin, now);
    expect(entries.map((e) => e.id)).toEqual(['old']);
    // No id: nothing is deleted.
    await undoDiaryForRestore(tx, { userId: 'u', activityId: 'a' }, { status: 'CONSUMING', ratingBefore: 7 }, undefined, berlin, now);
    expect(entries.map((e) => e.id)).toEqual(['old']);
  });

  it('clears a repeat run on a drop without writing an entry', async () => {
    const { tx, entries, act } = fakeTx({ id: 'a', userId: 'u', rewatching: true });
    const res = await applyDiaryForUpdate(tx, { id: 'a', userId: 'u', status: 'CONSUMING', rating: null, rewatching: true }, { status: 'DROPPED' }, berlin, now);
    expect(res.diaryEntryId).toBeUndefined();
    expect(entries).toEqual([]);
    expect(act.rewatching).toBe(false);
  });

  it('undoing a score after a same-day rescore restores the entry\'s score too', async () => {
    const { tx, entries } = fakeTx({ id: 'a', userId: 'u' });
    const before = { id: 'a', userId: 'u', status: 'CONSUMING', rating: null, rewatching: false };
    await applyDiaryForUpdate(tx, before, { status: 'COMPLETED' }, berlin, now);
    await applyDiaryForUpdate(tx, { ...before, status: 'COMPLETED' }, { rating: 9 }, berlin, now);
    expect(entries.map((e) => e.rating)).toEqual([9]);
    // Undo the score: the activity goes back to unrated, and so does today's entry.
    await undoDiaryForRestore(tx, { userId: 'u', activityId: 'a' }, { status: 'COMPLETED', ratingBefore: 9, rating: null }, undefined, berlin, now);
    expect(entries.map((e) => e.rating)).toEqual([null]);
  });
});

describe('writeImportDiary', () => {
  it('writes dated entries and keeps an undated review in the notes', async () => {
    const { tx, entries, act } = fakeTx({ id: 'a', userId: 'u', notes: 'mine' });
    const changed = await writeImportDiary(tx, 'u', 'a', { source: 'goodreads', status: 'DROPPED', review: 'Gave up halfway' });
    expect(changed).toBe(true);
    expect(entries).toEqual([]);
    expect(act.notes).toBe('mine\n\nReview (Goodreads): Gave up halfway');
    // Importing again changes nothing.
    expect(await writeImportDiary(tx, 'u', 'a', { source: 'goodreads', status: 'DROPPED', review: 'Gave up halfway' })).toBe(false);
  });

  it('puts a dated review on its entry, not in the notes', async () => {
    const { tx, entries, act } = fakeTx({ id: 'a', userId: 'u' });
    await writeImportDiary(tx, 'u', 'a', { source: 'goodreads', status: 'COMPLETED', finishedOn: '2024-05-01', review: 'Great' });
    expect(entries.map((e) => [e.date, e.review])).toEqual([['2024-05-01', 'Great']]);
    expect(act.notes).toBeNull();
  });
});
