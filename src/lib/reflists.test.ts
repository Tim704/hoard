import { describe, expect, it } from 'vitest';

import {
  cleanPastedTitle,
  isBuiltinSource,
  newRefItems,
  parsePlainLines,
  refPageCount,
  refProgress,
  refState,
  type RefItem,
} from './reflists';

describe('built-in sources', () => {
  it('page counts cover each list size', () => {
    expect(refPageCount('tmdb-movies')).toBe(13);
    expect(refPageCount('tmdb-tv')).toBe(5);
    expect(refPageCount('anilist-anime')).toBe(2);
    expect(refPageCount('anilist-manga')).toBe(2);
    expect(refPageCount('igdb-games')).toBe(1);
  });
  it('recognises only its own keys', () => {
    expect(isBuiltinSource('tmdb-movies')).toBe(true);
    expect(isBuiltinSource('toString')).toBe(false);
    expect(isBuiltinSource('custom')).toBe(false);
  });
});

const item = (id: string): RefItem => ({ externalId: id, title: `T${id}`, year: null, imageUrl: null });

describe('newRefItems', () => {
  it('skips titles already stored or repeated, and stops at the room left', () => {
    const out = newRefItems(new Set(['1']), [item('1'), item('2'), item('2'), item('3'), item('4')], 2);
    expect(out.map((i) => i.externalId)).toEqual(['2', '3']);
  });
  it('drops rows without an id or title', () => {
    expect(newRefItems(new Set(), [{ ...item('1'), title: '' }, { ...item(''), title: 'x' }], 10)).toEqual([]);
  });
});

describe('progress', () => {
  it('maps statuses to done / planned / other', () => {
    expect(refState('COMPLETED')).toBe('done');
    expect(refState('PLANNED')).toBe('planned');
    expect(refState('CONSUMING')).toBe('planned');
    expect(refState('ON_HOLD')).toBe('planned');
    expect(refState('DROPPED')).toBe('other');
    expect(refState('RETIRED')).toBe('other');
    expect(refState(null)).toBeNull();
  });
  it('counts against the library by section and id', () => {
    const items = [
      { category: 'movies', externalId: '1' },
      { category: 'movies', externalId: '2' },
      { category: 'movies', externalId: '3' },
      { category: 'tv', externalId: '1' },
    ];
    const library = new Map([
      ['movies:1', 'COMPLETED' as const],
      ['movies:2', 'PLANNED' as const],
      ['tv:3', 'COMPLETED' as const],
    ]);
    expect(refProgress(items, library)).toEqual({ total: 4, done: 1, planned: 1 });
  });
});

describe('parsePlainLines', () => {
  it('strips list markers and reads trailing years', () => {
    const text = '1. The Godfather (1972)\n2) Seven Samurai [1954]\n\n- Heat - 1995\n* Alien\n• Up\n#7 Spirited Away';
    expect(parsePlainLines(text)).toEqual([
      { title: 'The Godfather', year: 1972 },
      { title: 'Seven Samurai', year: 1954 },
      { title: 'Heat', year: 1995 },
      { title: 'Alien' },
      { title: 'Up' },
      { title: 'Spirited Away' },
    ]);
  });
  it('keeps numbers that are part of the title', () => {
    expect(parsePlainLines('1917\n2001: A Space Odyssey\nBlade Runner 2049')).toEqual([
      { title: '1917' },
      { title: '2001: A Space Odyssey' },
      { title: 'Blade Runner 2049' },
    ]);
  });
  it('handles CRLF and caps the count', () => {
    expect(parsePlainLines('A\r\nB\r\n')).toEqual([{ title: 'A' }, { title: 'B' }]);
    expect(parsePlainLines(Array.from({ length: 300 }, (_, i) => `T${i}`).join('\n'))).toHaveLength(200);
  });
});

describe('cleanPastedTitle', () => {
  it('trims, caps the length and keeps only plausible years', () => {
    expect(cleanPastedTitle('  Heat ', 1995)).toEqual({ title: 'Heat', year: 1995 });
    expect(cleanPastedTitle('x'.repeat(400), 3000)).toEqual({ title: 'x'.repeat(300) });
    expect(cleanPastedTitle('Up', 2009.5)).toEqual({ title: 'Up' });
    expect(cleanPastedTitle('Up', null)).toEqual({ title: 'Up' });
  });
  it('drops empty or non-text titles', () => {
    expect(cleanPastedTitle('   ', 2000)).toBeNull();
    expect(cleanPastedTitle(42, 2000)).toBeNull();
  });
});
