import { describe, expect, it } from 'vitest';

import { addChoiceLabels } from './status';
import { createLatestGuard, libraryBadge, nextHighlight, shouldSearch } from './search-nav';

describe('addChoiceLabels', () => {
  it('words the two choices per category', () => {
    expect(addChoiceLabels('books')).toEqual({ done: 'Read', want: 'Want to read' });
    expect(addChoiceLabels('games')).toEqual({ done: 'Beaten', want: 'Want to play' });
    expect(addChoiceLabels('music')).toEqual({ done: 'Listened', want: 'Want to listen' });
    expect(addChoiceLabels('movies')).toEqual({ done: 'Watched', want: 'Want to watch' });
    expect(addChoiceLabels('manga')).toEqual({ done: 'Read', want: 'Want to read' });
  });
});

describe('nextHighlight', () => {
  it('wraps and handles empty lists', () => {
    expect(nextHighlight(-1, 1, 3)).toBe(0);
    expect(nextHighlight(2, 1, 3)).toBe(0);
    expect(nextHighlight(0, -1, 3)).toBe(2);
    expect(nextHighlight(-1, -1, 3)).toBe(2);
    expect(nextHighlight(0, 1, 0)).toBe(-1);
  });
});

describe('shouldSearch', () => {
  it('needs 2 trimmed characters', () => {
    expect(shouldSearch(' d ')).toBe(false);
    expect(shouldSearch('du')).toBe(true);
  });
});

describe('createLatestGuard', () => {
  it('only the newest request is latest', () => {
    const g = createLatestGuard();
    const a = g.next();
    const b = g.next();
    expect(g.isLatest(a)).toBe(false);
    expect(g.isLatest(b)).toBe(true);
  });
});

describe('libraryBadge', () => {
  it('shows status and score when rated', () => {
    expect(libraryBadge({ status: 'COMPLETED', rating: 8.5 }, 'movies')).toBe('In library · Watched 8.5');
    expect(libraryBadge({ status: 'PLANNED', rating: null }, 'movies')).toBe('In library · Unwatched');
  });
});
