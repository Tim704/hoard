import { describe, expect, it } from 'vitest';

import { dayToDate } from './fields';
import { planImportFinish, type FinishNow } from './update';

const today = '2026-10-28';
const clock = new Date('2026-10-28T20:00:00Z');
const ongoing: FinishNow = { status: 'CONSUMING', finishedAt: null, rating: 7, rewatching: false };

describe('planImportFinish (final review 13)', () => {
  it('AniList pull finishing with a completion day: finishedAt from that day, its diary entry comes from finishedOn', () => {
    const plan = planImportFinish(ongoing, { status: 'COMPLETED' }, { source: 'anilist-sync', finishedOn: '2026-10-20' }, today, dayToDate, clock);
    expect(plan.finishedAt).toEqual(dayToDate('2026-10-20'));
    expect(plan.todayEntry).toBeNull(); // writeImportDiary writes the 2026-10-20 entry
  });

  it('no remote day: finishedAt now and an entry dated today in the user zone', () => {
    const plan = planImportFinish(ongoing, { status: 'COMPLETED', rating: 9 }, { source: 'anilist-sync' }, today, dayToDate, clock);
    expect(plan.finishedAt).toEqual(clock);
    expect(plan.todayEntry).toEqual({ date: today, rating: 9, rewatch: false });
  });

  it('Dropped → Completed is a finish too; a rewatch flag carries over', () => {
    const plan = planImportFinish(
      { ...ongoing, status: 'DROPPED', rewatching: true },
      { status: 'RETIRED' },
      { source: 'mal' },
      today,
      dayToDate,
      clock,
    );
    expect(plan.todayEntry).toEqual({ date: today, rating: 7, rewatch: true });
  });

  it('keeps a set finishedAt (AniList pull); an import with a day already patches it itself', () => {
    const done = { ...ongoing, finishedAt: new Date('2025-01-01T00:00:00Z') };
    const pull = planImportFinish(done, { status: 'COMPLETED', finishedAt: dayToDate('2026-10-20') }, { source: 'anilist-sync', finishedOn: '2026-10-20' }, today, dayToDate, clock);
    expect(pull.finishedAt).toBeNull();
    expect(pull.keepStoredFinishedAt).toBe(true);
    const imp = planImportFinish(done, { status: 'COMPLETED', finishedAt: dayToDate('2026-10-20') }, { source: 'mal', finishedOn: '2026-10-20' }, today, dayToDate, clock);
    expect(imp.keepStoredFinishedAt).toBe(false);
  });

  it('a dated log writes its own entries: no extra "today" entry', () => {
    const plan = planImportFinish(ongoing, { status: 'COMPLETED' }, { source: 'letterboxd', diary: [{}] }, today, dayToDate, clock);
    expect(plan.todayEntry).toBeNull();
  });

  it('no finish: Completed → Retired, a move to Ongoing, or no status change', () => {
    const done = { ...ongoing, status: 'COMPLETED' as const };
    expect(planImportFinish(done, { status: 'RETIRED' }, { source: 'mal' }, today, dayToDate, clock).todayEntry).toBeNull();
    expect(planImportFinish(ongoing, { rating: 3 }, { source: 'mal' }, today, dayToDate, clock)).toMatchObject({ finishedAt: null, todayEntry: null });
    expect(planImportFinish({ ...ongoing, status: 'PLANNED' }, { status: 'CONSUMING' }, { source: 'mal' }, today, dayToDate, clock).todayEntry).toBeNull();
  });
});
