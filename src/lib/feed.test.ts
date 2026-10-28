import { describe, expect, it } from 'vitest';

import {
  buildFeed,
  decodeCursor,
  diaryHorizon,
  diaryMoment,
  encodeCursor,
  eventKind,
  latestHorizon,
  relativeTime,
  sourceHorizon,
  wasUndone,
  type FeedCursor,
  type RawDiary,
  type RawEvent,
} from '@/lib/feed';
import { todayYmd } from '@/lib/release';

const NOW = new Date('2026-10-28T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const berlin = (_userId: string, at: Date) => todayYmd('Europe/Berlin', at);

const diary = (id: string, userId: string, createdAt: Date, date = todayYmd('Europe/Berlin', createdAt)): RawDiary => ({
  id,
  userId,
  activityId: `act-${id}`,
  date,
  createdAt,
  rating: 8,
  rewatch: false,
});

const event = (id: string, userId: string, at: Date, over: Partial<RawEvent> = {}): RawEvent => ({
  id,
  userId,
  activityId: `act-${id}`,
  kind: 'status',
  from: 'CONSUMING',
  to: 'DROPPED',
  at,
  meta: null,
  ...over,
});

describe('eventKind', () => {
  it('turns drops and new S placements into entries', () => {
    expect(eventKind({ kind: 'status', from: 'CONSUMING', to: 'DROPPED', meta: null })).toBe('drop');
    expect(eventKind({ kind: 'tier', from: null, to: 'S', meta: null })).toBe('s-tier');
    expect(eventKind({ kind: 'tier', from: 'A', to: 'S', meta: { via: 'suggestions' } })).toBe('s-tier');
  });

  it('skips Arena swaps inside S, undo restores and everything else', () => {
    expect(eventKind({ kind: 'tier', from: 'S', to: 'S', meta: { via: 'arena' } })).toBeNull();
    expect(eventKind({ kind: 'tier', from: 'A', to: 'S', meta: { via: 'arena' } })).toBeNull();
    expect(eventKind({ kind: 'tier', from: null, to: 'S', meta: { undo: true } })).toBeNull();
    expect(eventKind({ kind: 'status', from: 'CONSUMING', to: 'DROPPED', meta: { undo: true } })).toBeNull();
    expect(eventKind({ kind: 'status', from: 'CONSUMING', to: 'COMPLETED', meta: null })).toBeNull();
    expect(eventKind({ kind: 'tier', from: 'S', to: 'A', meta: null })).toBeNull();
    expect(eventKind({ kind: 'score', from: '5', to: 'S', meta: null })).toBeNull();
  });
});

describe('diaryMoment', () => {
  const ymd = (at: Date) => todayYmd('Europe/Berlin', at);
  it('uses the creation time when it is on the entry day', () => {
    const createdAt = new Date('2026-10-27T23:30:00.000Z'); // 00:30 on the 28th in Berlin
    expect(diaryMoment({ date: '2026-10-28', createdAt }, ymd)).toEqual(createdAt);
  });

  it('uses noon UTC of the entry day for runs logged later (and backfills)', () => {
    const createdAt = new Date('2026-10-28T10:00:00.000Z');
    expect(diaryMoment({ date: '2025-01-03', createdAt }, ymd)).toEqual(new Date('2025-01-03T12:00:00.000Z'));
  });

  it('is never later than the creation time', () => {
    const createdAt = new Date('2026-10-28T10:00:00.000Z');
    expect(diaryMoment({ date: '2026-10-29', createdAt }, ymd)).toEqual(createdAt);
  });
});

describe('buildFeed privacy filter', () => {
  it('never includes users outside the allowed set, even when the query returned them', () => {
    const { entries } = buildFeed(
      [diary('d1', 'alice', hoursAgo(1)), diary('d2', 'mallory', hoursAgo(2))],
      [event('e1', 'mallory', hoursAgo(3)), event('e2', 'alice', hoursAgo(4), { kind: 'tier', from: null, to: 'S' })],
      { allowed: new Set(['alice']), now: NOW, ymdOf: berlin },
    );
    expect(entries.map((e) => e.userId)).toEqual(['alice', 'alice']);
    expect(entries.map((e) => e.kind)).toEqual(['finish', 's-tier']);
  });

  it('shows nothing when nobody opted in', () => {
    const { entries, next } = buildFeed([diary('d1', 'alice', hoursAgo(1))], [event('e1', 'alice', hoursAgo(1))], {
      allowed: new Set(),
      now: NOW,
      ymdOf: berlin,
    });
    expect(entries).toEqual([]);
    expect(next).toBeNull();
  });
});

describe('buildFeed window, order and paging', () => {
  it('keeps only the last 30 days, newest first', () => {
    const { entries } = buildFeed(
      [diary('old', 'a', hoursAgo(31 * 24)), diary('new', 'a', hoursAgo(1)), diary('backfill', 'a', NOW, '2025-05-01')],
      [event('e', 'a', hoursAgo(29 * 24))],
      { allowed: new Set(['a']), now: NOW, ymdOf: berlin },
    );
    expect(entries.map((e) => e.id)).toEqual(['d:new', 'e:e']);
  });

  it('pages with a stable cursor and no duplicates', () => {
    const events = Array.from({ length: 7 }, (_, i) => event(`e${i}`, 'a', hoursAgo(i < 3 ? 1 : i)));
    const opts = { allowed: new Set(['a']), now: NOW, ymdOf: berlin, limit: 3 };
    const seen: string[] = [];
    let cursor: FeedCursor | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page: ReturnType<typeof buildFeed> = buildFeed([], events, { ...opts, cursor });
      seen.push(...page.entries.map((e) => e.id));
      if (!page.next) break;
      cursor = decodeCursor(encodeCursor(page.next));
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });
});

describe('buildFeed with undone actions', () => {
  it('drops a drop or S placement that a later undo took back, keeps the rest', () => {
    const drop = event('drop', 'a', hoursAgo(5));
    const s = event('s', 'a', hoursAgo(4), { kind: 'tier', from: 'A', to: 'S' });
    const keptDrop = event('kept', 'a', hoursAgo(3));
    const undos = [
      { activityId: 'act-drop', kind: 'status', from: 'DROPPED', at: hoursAgo(4.9) },
      { activityId: 'act-s', kind: 'tier', from: 'S', at: hoursAgo(3.9) },
      // An undo BEFORE the entry, or of another kind, doesn't count.
      { activityId: 'act-kept', kind: 'status', from: 'DROPPED', at: hoursAgo(3.5) },
      { activityId: 'act-kept', kind: 'tier', from: 'S', at: hoursAgo(1) },
    ];
    const { entries } = buildFeed([], [drop, s, keptDrop], { allowed: new Set(['a']), now: NOW, ymdOf: berlin, undos });
    expect(entries.map((e) => e.id)).toEqual(['e:kept']);
  });

  it('wasUndone never applies to finishes', () => {
    expect(
      wasUndone({ kind: 'finish', activityId: 'x', at: hoursAgo(2) }, [{ activityId: 'x', kind: 'status', from: 'DROPPED', at: NOW }]),
    ).toBe(false);
  });
});

describe('buildFeed horizon (capped sources)', () => {
  it('computes horizons only for full sources', () => {
    const rows = [{ at: hoursAgo(1) }, { at: hoursAgo(2) }];
    expect(sourceHorizon(rows, 3)).toBeNull();
    expect(sourceHorizon(rows, 2)).toEqual(hoursAgo(2));
    expect(diaryHorizon([{ date: '2026-10-27' }], 2)).toBeNull();
    expect(diaryHorizon([{ date: '2026-10-28' }, { date: '2026-10-20' }], 2)).toEqual(new Date('2026-10-21T12:00:00.000Z'));
    expect(latestHorizon(null, hoursAgo(5), hoursAgo(2), null)).toEqual(hoursAgo(2));
    expect(latestHorizon(null, null)).toBeNull();
  });

  it('stops at the horizon and continues from it on a short page, losing nothing', () => {
    // Source A was capped at 2 rows (hours 1 and 3); hours 5 and 7 exist but weren't read.
    const all = [1, 3, 5, 7].map((h) => event(`a${h}`, 'a', hoursAgo(h)));
    const other = [2, 6].map((h) => event(`b${h}`, 'b', hoursAgo(h)));
    const base = { allowed: new Set(['a', 'b']), now: NOW, ymdOf: berlin, limit: 50 };
    const first = buildFeed([], [...all.slice(0, 2), ...other], { ...base, horizon: sourceHorizon(all.slice(0, 2), 2) });
    expect(first.entries.map((e) => e.id)).toEqual(['e:a1', 'e:b2']);
    expect(first.next).not.toBeNull();
    // Next request: the DB returns what is at or before the cursor.
    const c = first.next!;
    const rest = [...all, ...other].filter((e) => e.at <= c.at);
    const second = buildFeed([], rest, { ...base, cursor: decodeCursor(encodeCursor(c)) });
    expect(second.entries.map((e) => e.id)).toEqual(['e:a3', 'e:a5', 'e:b6', 'e:a7']);
    expect(second.next).toBeNull();
  });

  it('returns an empty page that moves to the horizon when nothing newer survives', () => {
    // Source capped at 2 rows (hours 1 and 3), both undone; hours 5 and 7 weren't read.
    const read = [event('u1', 'a', hoursAgo(1)), event('u3', 'a', hoursAgo(3))];
    const undos = read.map((e) => ({ activityId: e.activityId, kind: 'status', from: 'DROPPED', at: hoursAgo(0.5) }));
    const base = { allowed: new Set(['a']), now: NOW, ymdOf: berlin, undos };
    const first = buildFeed([], read, { ...base, horizon: sourceHorizon(read, 2) });
    expect(first.entries).toEqual([]);
    expect(first.next).toEqual({ at: hoursAgo(3), skip: 0 });
    const rest = [3, 5, 7].map((h) => event(`r${h}`, 'a', hoursAgo(h)));
    const second = buildFeed([], rest, { ...base, cursor: first.next });
    expect(second.entries.map((e) => e.id)).toEqual(['e:r3', 'e:r5', 'e:r7']);
  });

  it('ignores the horizon only when stopping there would make no progress', () => {
    // Every capped row sits at the cursor instant itself: the horizon equals the cursor.
    const cursor = { at: hoursAgo(2), skip: 0 };
    const rows = [event('x1', 'a', hoursAgo(2)), event('x2', 'a', hoursAgo(2)), event('x3', 'a', hoursAgo(4))];
    const page = buildFeed([], rows, {
      allowed: new Set(['a']),
      now: NOW,
      ymdOf: berlin,
      cursor,
      horizon: hoursAgo(2),
    });
    expect(page.entries.map((e) => e.id)).toEqual(['e:x2', 'e:x1', 'e:x3']);
    expect(page.next).toBeNull();
  });

  it('pages through many entries at the same instant without repeats', () => {
    const same = Array.from({ length: 5 }, (_, i) => event(`s${i}`, 'a', hoursAgo(1)));
    const seen: string[] = [];
    let cursor: FeedCursor | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page: ReturnType<typeof buildFeed> = buildFeed([], same, { allowed: new Set(['a']), now: NOW, ymdOf: berlin, limit: 2, cursor });
      seen.push(...page.entries.map((e) => e.id));
      if (!page.next) break;
      cursor = page.next;
    }
    expect(seen.sort()).toEqual(['e:s0', 'e:s1', 'e:s2', 'e:s3', 'e:s4']);
  });
});

describe('cursor and relative time', () => {
  it('round-trips a cursor and rejects junk', () => {
    const c = { at: NOW, skip: 3 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(encodeCursor(c)).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
    expect(decodeCursor('nope')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('123~e:abc')).toBeNull();
  });

  it('reads like a person would say it', () => {
    expect(relativeTime(new Date(NOW.getTime() - 20_000), NOW)).toBe('just now');
    expect(relativeTime(hoursAgo(0.5), NOW)).toBe('30 min ago');
    expect(relativeTime(hoursAgo(5), NOW)).toBe('5 h ago');
    expect(relativeTime(hoursAgo(30), NOW)).toBe('yesterday');
    expect(relativeTime(hoursAgo(24 * 4), NOW)).toBe('4 days ago');
  });
});
