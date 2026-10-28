import { describe, expect, it } from 'vitest';

import { diaryText, eventText, historyItems, sourceName, type HistoryDiary, type HistoryEvent } from './history';

const score = (v: number) => v.toFixed(1);
const ev = (over: Partial<HistoryEvent>): HistoryEvent => ({
  id: 'e',
  kind: 'status',
  from: null,
  to: null,
  at: '2026-10-28T10:00:00.000Z',
  ...over,
});

describe('eventText', () => {
  it('words every event kind plainly, per medium', () => {
    expect(eventText(ev({ kind: 'score', from: null, to: '8.5' }), 'movies', score)).toBe('Scored 8.5');
    expect(eventText(ev({ kind: 'score', from: '7', to: '8.5' }), 'movies', score)).toBe('Scored 8.5 (was 7.0)');
    expect(eventText(ev({ kind: 'score', from: '7', to: null }), 'movies', score)).toBe('Cleared the score');
    expect(eventText(ev({ kind: 'status', from: 'CONSUMING', to: 'PLANNED' }), 'movies', score)).toBe('Moved to Up next');
    expect(eventText(ev({ kind: 'status', from: 'PLANNED', to: 'CONSUMING' }), 'books', score)).toBe('Marked as Reading');
    expect(eventText(ev({ kind: 'status', to: 'COMPLETED' }), 'games', score)).toBe('Marked as Beaten');
    expect(eventText(ev({ kind: 'added', to: 'PLANNED' }), 'movies', score)).toBe('Added to Up next');
    expect(eventText(ev({ kind: 'added', to: 'COMPLETED' }), 'music', score)).toBe('Added as Listened');
    expect(eventText(ev({ kind: 'import', meta: { source: 'letterboxd' } }), 'movies', score)).toBe('Imported from Letterboxd');
    expect(eventText(ev({ kind: 'import', meta: { source: 'mal', updated: true } }), 'anime', score)).toBe('Updated from MyAnimeList');
    expect(eventText(ev({ kind: 'progress', to: '1' }), 'books', score)).toBe('Progress: 1 page');
    expect(eventText(ev({ kind: 'progress', to: '12' }), 'anime', score)).toBe('Progress: 12 episodes');
    expect(eventText(ev({ kind: 'tier', to: 'S' }), 'movies', score)).toBe('Placed in tier S');
    expect(eventText(ev({ kind: 'tier', from: 'A', to: 'S' }), 'movies', score)).toBe('Moved from tier A to S');
    expect(eventText(ev({ kind: 'tier', from: 'A', to: null }), 'movies', score)).toBe('Taken off the tier list');
    expect(eventText(ev({ kind: 'queue', from: '3', to: '1' }), 'movies', score)).toBe('Moved in Up next from #3 to #1');
    expect(eventText(ev({ kind: 'removed-undone' }), 'movies', score)).toBe('Brought back after a remove');
    expect(eventText(ev({ kind: 'rewatch', to: 'CONSUMING' }), 'books', score)).toBe('Started reading again');
    expect(eventText(ev({ kind: 'rewatch' }), 'music', score)).toBe('Started listening again');
    expect(eventText(ev({ kind: 'review', to: '1' }), 'movies', score)).toBe('Wrote a review');
    expect(eventText(ev({ kind: 'review', from: '1', to: '1' }), 'movies', score)).toBe('Edited the review');
    expect(eventText(ev({ kind: 'review', from: '1', to: null }), 'movies', score)).toBe('Removed the review');
  });

  it('marks undone changes', () => {
    expect(eventText(ev({ kind: 'status', to: 'CONSUMING', meta: { undo: true } }), 'movies', score)).toBe('Undo: marked as Watching');
    expect(eventText(ev({ kind: 'score', to: '6', meta: { undo: true } }), 'movies', score)).toBe('Undo: scored 6.0');
  });

  it('names import sources, with a fallback', () => {
    expect(sourceName('goodreads')).toBe('Goodreads');
    expect(sourceName('nope')).toBe('an import');
    expect(sourceName(undefined)).toBe('an import');
  });
});

describe('diaryText', () => {
  const d: HistoryDiary = { id: 'd', date: '2026-10-28', rating: 8.5, rewatch: true, review: null, createdAt: '2026-10-28T10:00:00.000Z' };
  it('reads as a finished run', () => {
    expect(diaryText(d, 'movies', score)).toBe('Watched (rewatch) · 8.5');
    expect(diaryText({ ...d, rewatch: false, rating: null }, 'books', score)).toBe('Read');
  });
});

describe('historyItems', () => {
  it('merges events and diary entries newest first, on the user\'s days', () => {
    const items = historyItems(
      [
        ev({ id: 'add', kind: 'added', to: 'PLANNED', at: '2026-03-01T09:00:00.000Z' }),
        // 00:30 Berlin on 12 Mar: the finish, covered by the diary entry of that day.
        ev({ id: 'fin', kind: 'status', from: 'CONSUMING', to: 'COMPLETED', at: '2026-03-11T23:30:00.000Z' }),
        ev({ id: 'sc', kind: 'score', to: '9', at: '2026-03-11T23:31:00.000Z' }),
        ev({ id: 'tier', kind: 'tier', to: 'S', at: '2026-04-02T08:00:00.000Z' }),
      ],
      [
        { id: 'd1', date: '2026-03-12', rating: 9, rewatch: false, review: null, createdAt: '2026-03-11T23:30:00.000Z' },
        // Logged later by hand for an older watch: sorts at the end of its day.
        { id: 'd0', date: '2026-03-01', rating: null, rewatch: false, review: null, createdAt: '2026-05-01T10:00:00.000Z' },
      ],
      'movies',
      'Europe/Berlin',
      score,
    );
    expect(items.map((i) => [i.id, i.day, i.text])).toEqual([
      ['tier', '2026-04-02', 'Placed in tier S'],
      ['sc', '2026-03-12', 'Scored 9.0'],
      ['d1', '2026-03-12', 'Watched · 9.0'],
      ['d0', '2026-03-01', 'Watched'],
      ['add', '2026-03-01', 'Added to Up next'],
    ]);
  });

  it('hides arena swaps inside one tier, keeps real tier moves', () => {
    const items = historyItems(
      [
        ev({ id: 'swap', kind: 'tier', from: 'S', to: 'S', meta: { via: 'arena', above: 'x' }, at: '2026-05-01T10:00:00.000Z' }),
        ev({ id: 'up', kind: 'tier', from: 'A', to: 'S', meta: { via: 'arena' }, at: '2026-05-01T10:01:00.000Z' }),
        ev({ id: 'hand', kind: 'tier', from: 'B', to: 'B', at: '2026-05-01T10:02:00.000Z' }),
      ],
      [],
      'movies',
      'UTC',
      score,
    );
    expect(items.map((i) => i.id)).toEqual(['hand', 'up']);
  });

  it('shows Watch again once', () => {
    const at = '2026-05-01T10:00:00.000Z';
    const items = historyItems(
      [
        ev({ id: 's', kind: 'status', from: 'COMPLETED', to: 'CONSUMING', at }),
        ev({ id: 'r', kind: 'rewatch', from: 'COMPLETED', to: 'CONSUMING', at }),
      ],
      [],
      'anime',
      'UTC',
      score,
    );
    expect(items.map((i) => i.text)).toEqual(['Started watching again']);
  });

  it('keeps a finish event when no diary entry covers that day (e.g. a backdated one)', () => {
    const items = historyItems(
      [ev({ id: 'fin', kind: 'status', to: 'COMPLETED', at: '2026-03-12T10:00:00.000Z' })],
      [],
      'movies',
      'UTC',
      score,
    );
    expect(items.map((i) => i.text)).toEqual(['Marked as Watched']);
  });
});
