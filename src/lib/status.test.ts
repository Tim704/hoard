import { describe, expect, it } from 'vitest';

import { statusSummary } from './status';

describe('statusSummary', () => {
  it('counts each status in the section’s words, commonest first', () => {
    expect(statusSummary(['PLANNED', 'COMPLETED', 'COMPLETED'])).toBe('2 completed, 1 planned');
    expect(statusSummary(['PLANNED', 'COMPLETED', 'COMPLETED'], 'books')).toBe('2 read, 1 unread');
    expect(statusSummary(['CONSUMING', 'ON_HOLD', 'ON_HOLD', 'ON_HOLD'], 'games')).toBe('3 paused, 1 playing');
  });
  it('breaks ties in the status sort order', () => {
    expect(statusSummary(['DROPPED', 'PLANNED', 'CONSUMING'], 'movies')).toBe('1 watching, 1 unwatched, 1 dropped');
  });
  it('names a single status once', () => {
    expect(statusSummary(['COMPLETED', 'COMPLETED'], 'tv')).toBe('2 watched');
    expect(statusSummary([])).toBe('');
  });
});
