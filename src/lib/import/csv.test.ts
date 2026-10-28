import { describe, expect, it } from 'vitest';

import { BOM, toCsv } from '@/lib/export';

import { csvRecords, parseCsv } from './csv';
import { dayToDate, parseDay, parseIsbn, parseRating, parseYear, splitList } from './fields';
import { todayYmd } from '@/lib/release';

describe('parseCsv', () => {
  it('drops a leading BOM', () => {
    expect(parseCsv(`${BOM}a,b\n1,2`)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps quoted commas, doubled quotes and newlines inside a field', () => {
    const text = 'title,note\r\n"Crouching Tiger, Hidden Dragon","He said ""hi""\r\nthen left"\r\n';
    expect(parseCsv(text)).toEqual([
      ['title', 'note'],
      ['Crouching Tiger, Hidden Dragon', 'He said "hi"\r\nthen left'],
    ]);
  });

  it('accepts LF, CRLF and lone CR line ends and skips blank lines', () => {
    expect(parseCsv('a\n\nb\r\n\r\nc\rd\n\n\n')).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('keeps a line of empty cells and a quoted empty field', () => {
    expect(parseCsv('a,b\n,\n""\n')).toEqual([['a', 'b'], ['', ''], ['']]);
  });

  it('reads a last line without a line end', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('round-trips the export writer', () => {
    const rows = [
      ['title', 'notes'],
      ['Amélie, Paris', 'line one\r\nline "two"'],
      ['千と千尋の神隠し', ''],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('csvRecords', () => {
  it('keys cells by trimmed header and fills missing trailing cells', () => {
    const { headers, records } = csvRecords(' Name ,Year,Rating\nHeat,1995\n');
    expect(headers).toEqual(['Name', 'Year', 'Rating']);
    expect(records).toEqual([{ Name: 'Heat', Year: '1995', Rating: '' }]);
  });

  it('handles an empty file', () => {
    expect(csvRecords('')).toEqual({ headers: [], records: [] });
  });
});

describe('cell readers', () => {
  it('parseDay accepts dashes, slashes and a trailing time; rejects impossible days', () => {
    expect(parseDay('2024/03/09')).toBe('2024-03-09');
    expect(parseDay('2024-3-9')).toBe('2024-03-09');
    expect(parseDay('2024-03-09 14:02:11')).toBe('2024-03-09');
    expect(parseDay('2024-02-30')).toBeUndefined();
    expect(parseDay('')).toBeUndefined();
    expect(parseDay('March 9')).toBeUndefined();
  });

  it('dayToDate stays on the same calendar day from UTC-11 to UTC+11', () => {
    const d = dayToDate('2024-12-31');
    expect(todayYmd('Pacific/Pago_Pago', d)).toBe('2024-12-31');
    expect(todayYmd('Europe/Berlin', d)).toBe('2024-12-31');
    expect(todayYmd('Pacific/Noumea', d)).toBe('2024-12-31');
  });

  it('parseRating scales stars, keeps halves and quarters, and treats 0 / empty as unrated', () => {
    expect(parseRating('4.5', 5)).toBe(9);
    expect(parseRating('0.5', 5)).toBe(1);
    expect(parseRating('4.25', 5)).toBe(8.5);
    expect(parseRating('3,5', 5)).toBe(7);
    expect(parseRating('0', 5)).toBeUndefined();
    expect(parseRating('', 5)).toBeUndefined();
    expect(parseRating('6', 5)).toBeUndefined();
    expect(parseRating('abc', 5)).toBeUndefined();
    expect(parseRating(8.5, 10)).toBe(8.5);
  });

  it('parseYear rejects junk', () => {
    expect(parseYear('1995')).toBe(1995);
    expect(parseYear('')).toBeUndefined();
    expect(parseYear('0')).toBeUndefined();
    expect(parseYear('3000')).toBeUndefined();
  });

  it('parseIsbn strips the Goodreads ="…" wrapper and hyphens, rejects other UIDs', () => {
    expect(parseIsbn('="9780439023481"')).toBe('9780439023481');
    expect(parseIsbn('=""')).toBeUndefined();
    expect(parseIsbn('0-439-02348-3')).toBe('0439023483');
    expect(parseIsbn('080442957x')).toBe('080442957X');
    expect(parseIsbn('B08FHBV4ZX')).toBeUndefined();
  });

  it('splitList trims and drops empties and repeats', () => {
    expect(splitList(' a, b ,,a; c')).toEqual(['a', 'b', 'c']);
    expect(splitList('x; y', /;/)).toEqual(['x', 'y']);
  });
});
