import { describe, expect, it } from 'vitest';

import type { NormalizedResult } from '@/lib/types';

import { hitConfidence, includedByDefault, matchKey, scoreMatch, titlesMatch } from './match';
import { dedupeRows, mergeRows, rowKey } from './rows';
import type { ImportRow } from './types';

const hit = (externalId: string, title: string, year: number | null = null): NormalizedResult => ({
  externalId,
  title,
  year,
  imageUrl: null,
  subtitle: null,
  description: null,
  fields: { externalId, title },
});

const row = (title: string, year?: number): ImportRow => ({
  source: 'letterboxd',
  category: 'movies',
  title,
  ...(year && { year }),
  ids: {},
  status: 'COMPLETED',
});

describe('matchKey / titlesMatch', () => {
  it('ignores case, accents, punctuation, "&" and a leading article', () => {
    expect(matchKey('The Lord of the Rings: The Two Towers!')).toBe('lord of the rings the two towers');
    expect(matchKey('Amélie')).toBe(matchKey('AMELIE'));
    expect(matchKey('Fast & Furious')).toBe(matchKey('Fast and Furious'));
    expect(matchKey("Schindler's List")).toBe(matchKey('Schindlers List'));
    expect(matchKey('千と千尋の神隠し')).toBe('千と千尋の神隠し');
  });

  it('matches a title whose other side adds a subtitle, but not two different subtitles', () => {
    expect(titlesMatch('Dune', 'Dune: Part One')).toBe(true);
    expect(titlesMatch('Dune: Part One', 'Dune: Part Two')).toBe(false);
    expect(titlesMatch('Heat', 'Heathers')).toBe(false);
    expect(titlesMatch('', '')).toBe(false);
  });
});

describe('hitConfidence', () => {
  it('title + same year = high; missing year = medium; other year or title = low', () => {
    expect(hitConfidence(row('Heat', 1995), hit('1', 'Heat', 1995))).toBe('high');
    expect(hitConfidence(row('Heat'), hit('1', 'Heat', 1995))).toBe('medium');
    expect(hitConfidence(row('Heat', 1995), hit('1', 'Heat', null))).toBe('medium');
    expect(hitConfidence(row('Heat', 1995), hit('1', 'Heat', 1986))).toBe('low');
    expect(hitConfidence(row('Heat', 1995), hit('1', 'Heathers', 1995))).toBe('low');
  });
});

describe('scoreMatch', () => {
  it('no hits → none', () => {
    expect(scoreMatch(row('Nothing'), [])).toEqual({ candidates: [], chosenIndex: -1, confidence: 'none' });
  });

  it('prefers the exact title + year over the provider’s first hit', () => {
    const res = scoreMatch(row('Heat', 1995), [hit('a', 'Heat', 1986), hit('b', 'Heat', 1995), hit('c', 'Heat 2', 2025), hit('d', 'Heatwave', 2001)]);
    expect(res.confidence).toBe('high');
    expect(res.chosenIndex).toBe(0);
    expect(res.candidates.map((c) => c.externalId)).toEqual(['b', 'a', 'c']);
  });

  it('an id hit wins and is high even with a different title', () => {
    const res = scoreMatch(row('Kimi no Na wa', 2016), [hit('1', 'Your Name', 2016), hit('2', 'Kimi no Na wa', 2016)], 0);
    expect(res.confidence).toBe('high');
    expect(res.candidates[0].externalId).toBe('1');
  });

  it('falls back to low with the first hit', () => {
    const res = scoreMatch(row('Something Else', 2001), [hit('x', 'Other', 2001), hit('y', 'Another', 2002)]);
    expect(res.confidence).toBe('low');
    expect(res.candidates[0].externalId).toBe('x');
  });

  it('drops duplicate hits', () => {
    const res = scoreMatch(row('Heat'), [hit('a', 'Heat', 1995), hit('a', 'Heat', 1995)]);
    expect(res.candidates).toHaveLength(1);
    expect(res.confidence).toBe('medium');
  });

  it('only high and medium are ticked by default', () => {
    expect(includedByDefault('high')).toBe(true);
    expect(includedByDefault('medium')).toBe(true);
    expect(includedByDefault('low')).toBe(false);
    expect(includedByDefault('none')).toBe(false);
  });
});

describe('dedupeRows / mergeRows', () => {
  it('keys by id when there is one, else by normalised title + year', () => {
    expect(rowKey({ ...row('The Heat', 1995) })).toBe(rowKey(row('heat', 1995)));
    expect(rowKey(row('Heat', 1995))).not.toBe(rowKey(row('Heat', 1986)));
    expect(rowKey({ ...row('A'), ids: { isbn: '1' } })).toBe(rowKey({ ...row('B'), ids: { isbn: '1' } }));
  });

  it('merges toward the furthest status and the richest fields', () => {
    const a: ImportRow = { ...row('Heat', 1995), status: 'PLANNED', tags: ['x'], finishedOn: '2020-01-01' };
    const b: ImportRow = { ...row('Heat', 1995), status: 'COMPLETED', rating: 8, tags: ['x', 'y'], finishedOn: '2021-01-01', startedOn: '2019-01-01', rewatchCount: 2 };
    expect(mergeRows(a, b)).toEqual({
      ...row('Heat', 1995),
      status: 'COMPLETED',
      rating: 8,
      tags: ['x', 'y'],
      startedOn: '2019-01-01',
      finishedOn: '2021-01-01',
      rewatchCount: 2,
    });
  });

  it('keeps first-seen order', () => {
    const out = dedupeRows([row('A', 2000), row('B', 2000), row('a', 2000)]);
    expect(out.map((r) => r.title)).toEqual(['A', 'B']);
  });
});

describe('sanitizeRow', () => {
  it('caps long text and tag piles, drops oversized ids', async () => {
    const { sanitizeRow } = await import('./rows');
    const out = sanitizeRow({
      ...row('x'.repeat(600)),
      notes: 'n'.repeat(6000),
      tags: Array.from({ length: 60 }, (_, i) => `t${i}`.padEnd(150, 'z')),
      ids: { tmdb: '1'.repeat(80), mal: '5' },
    });
    expect(out.title).toHaveLength(500);
    expect(out.notes).toHaveLength(5000);
    expect(out.tags).toHaveLength(50);
    expect(out.tags![0]).toHaveLength(100);
    expect(out.ids).toEqual({ mal: '5' });
  });
});
