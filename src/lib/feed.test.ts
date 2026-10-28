import { describe, expect, it } from 'vitest';

import {
  buildFeed,
  decodeCursor,
  diaryMoment,
  encodeCursor,
  eventKind,
  relativeTime,
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
    let cursor = null;
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

describe('cursor and relative time', () => {
  it('round-trips a cursor and rejects junk', () => {
    const c = { at: NOW, id: 'e:abc123' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor('nope')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('123~x:abc')).toBeNull();
  });

  it('reads like a person would say it', () => {
    expect(relativeTime(new Date(NOW.getTime() - 20_000), NOW)).toBe('just now');
    expect(relativeTime(hoursAgo(0.5), NOW)).toBe('30 min ago');
    expect(relativeTime(hoursAgo(5), NOW)).toBe('5 h ago');
    expect(relativeTime(hoursAgo(30), NOW)).toBe('yesterday');
    expect(relativeTime(hoursAgo(24 * 4), NOW)).toBe('4 days ago');
  });
});
