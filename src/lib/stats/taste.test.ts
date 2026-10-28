import { describe, expect, it } from 'vitest';

import { entry, statTitle } from './fixtures';
import { dropPointPhrase, dropPoints, genreDrift, median, progressAtDrop, type DropEvent } from './taste';

const ev = (kind: string, to: string | null, at: string): DropEvent => ({ kind, to, at: new Date(at) });

describe('progressAtDrop', () => {
  it('takes the progress in force at the DROPPED status event', () => {
    const events = [
      ev('progress', '2', '2026-01-01T10:00:00Z'),
      ev('progress', '4', '2026-01-02T10:00:00Z'),
      ev('status', 'DROPPED', '2026-01-03T10:00:00Z'),
      ev('progress', '9', '2026-01-04T10:00:00Z'), // after the drop
    ];
    expect(progressAtDrop(events, 9)).toBe(4);
  });

  it('uses the last drop when dropped twice, whatever the event order', () => {
    const events = [
      ev('status', 'DROPPED', '2026-03-01T00:00:00Z'),
      ev('progress', '7', '2026-02-01T00:00:00Z'),
      ev('status', 'DROPPED', '2026-01-01T00:00:00Z'),
      ev('progress', '3', '2025-12-01T00:00:00Z'),
    ];
    expect(progressAtDrop(events, null)).toBe(7);
  });

  it('counts a progress event at the same instant as the drop', () => {
    expect(progressAtDrop([ev('status', 'DROPPED', '2026-01-01T00:00:00Z'), ev('progress', '5', '2026-01-01T00:00:00Z')], null)).toBe(5);
  });

  it('falls back to the current progress', () => {
    expect(progressAtDrop([], 6)).toBe(6);
    expect(progressAtDrop([ev('status', 'DROPPED', '2026-01-01T00:00:00Z')], 6)).toBe(6);
    expect(progressAtDrop([ev('progress', null, '2025-01-01T00:00:00Z'), ev('status', 'DROPPED', '2026-01-01T00:00:00Z')], 6)).toBe(6);
    expect(progressAtDrop([ev('status', 'COMPLETED', '2026-01-01T00:00:00Z')], null)).toBeNull();
  });
});

describe('median', () => {
  it('odd and even counts', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('dropPoints', () => {
  it('medians per section that tracks progress', () => {
    const rows = dropPoints([
      { category: 'tv', progress: 3, total: 10 },
      { category: 'tv', progress: 5, total: null },
      { category: 'tv', progress: null, total: 8 },
      { category: 'books', progress: 100, total: 400 },
      { category: 'books', progress: 150, total: 300 },
      { category: 'movies', progress: null, total: null },
    ]);
    expect(rows.map((r) => r.slug)).toEqual(['books', 'tv']);
    expect(rows[1]).toMatchObject({ dropped: 3, measured: 2, medianProgress: 4, medianShare: 0.3 });
    expect(rows[0].medianShare).toBeCloseTo(0.375);
  });

  it('phrases shows by episode and other sections by share', () => {
    const [books, tv] = dropPoints([
      { category: 'tv', progress: 4, total: 10 },
      { category: 'books', progress: 35, total: 100 },
    ]);
    expect(dropPointPhrase(tv)).toBe('around episode 4');
    expect(dropPointPhrase(books)).toBe('around 35%');
    const [manga] = dropPoints([{ category: 'manga', progress: 12, total: null }]);
    expect(dropPointPhrase(manga)).toBe('around chapter 12');
    const [unknown] = dropPoints([{ category: 'anime', progress: null, total: 12 }]);
    expect(dropPointPhrase(unknown)).toBeNull();
  });
});

describe('genreDrift', () => {
  it('averages per top genre per year, using the diary score first', () => {
    const a = statTitle({ rating: 6, media: { genres: ['Drama'] } });
    const b = statTitle({ rating: 9, media: { genres: ['drama', 'Horror'] } });
    const c = statTitle({ status: 'DROPPED', rating: 1, media: { genres: ['Drama'] } });
    const d = drift([a, b, c], [entry(a, '2025-05-01', 8), entry(b, '2026-01-01'), entry(a, '2026-02-01'), entry(c, '2026-03-01')]);
    expect(d.years).toEqual([2025, 2026]);
    expect(d.genres).toEqual(['Drama', 'Horror']);
    expect(d.rows[0]).toEqual({ genre: 'Drama', scores: [8, 7.5], counts: [1, 2] });
    expect(d.rows[1]).toEqual({ genre: 'Horror', scores: [null, 9], counts: [0, 1] });
  });

  function drift(...args: Parameters<typeof genreDrift>) {
    return genreDrift(...args);
  }
});
