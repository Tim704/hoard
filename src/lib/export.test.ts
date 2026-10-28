import { describe, expect, it } from 'vitest';

import {
  BOM,
  csvField,
  exportablePrefs,
  exportFilename,
  LIBRARY_COLUMNS,
  parseCsv,
  toCsv,
  toFranchisesCsv,
  toLibraryCsv,
  type ExportActivity,
} from './export';
import { parsePrefs } from './prefs';
import { makeActivity } from './test-fixtures';

const exp = (o: Parameters<typeof makeActivity>[0] & Partial<ExportActivity>): ExportActivity => ({
  startedAt: null,
  finishedAt: null,
  ...makeActivity(o),
  ...o,
});

describe('csv quoting', () => {
  it('quotes only fields that need it and doubles inner quotes', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField('cr\rhere')).toBe('"cr\rhere"');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(8.5)).toBe('8.5');
    expect(csvField(0)).toBe('0');
  });

  it('starts with a BOM and ends every line with CRLF', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe(`${BOM}a,b\r\n1,2\r\n`);
  });

  it('round-trips awkward values through parseCsv', () => {
    const rows = [
      ['title', 'notes', 'empty'],
      ['Crime, and "Punishment"', 'line one\nline two\r\nline three', ''],
      ['ナルト', '"', ',,,'],
      ['  spaces  ', '', 'end'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('parses LF-only files and a final line without a newline', () => {
    expect(parseCsv('a,b\n1,"x\ny"')).toEqual([
      ['a', 'b'],
      ['1', 'x\ny'],
    ]);
  });
});

describe('toLibraryCsv', () => {
  const list: ExportActivity[] = [
    exp({ id: 'm-b', category: 'movies', tier: 'A', rankOrder: 1000, rating: 8 }),
    exp({ id: 'm-a', category: 'movies', tier: 'S', rankOrder: 2000, rating: 9.5, favorite: true }),
    exp({ id: 'm-s1', category: 'movies', tier: 'S', rankOrder: 1000 }),
    exp({ id: 'm-q2', category: 'movies', status: 'PLANNED', queueOrder: 2000 }),
    exp({ id: 'm-q1', category: 'movies', status: 'PLANNED', queueOrder: 1000 }),
    exp({
      id: 'b-1',
      category: 'books',
      status: 'CONSUMING',
      progress: 120,
      notes: 'Great, "really"\ngreat',
      franchise: { id: 'f', name: 'Dune', imageUrl: null, rating: null },
      startedAt: '2026-01-04T23:30:00.000Z', // 00:30 on 5 Jan in Berlin
      finishedAt: null,
      tags: ['sci-fi', 'classic'],
    }),
  ];

  it('writes the header and one row per activity, sections in navigation order', () => {
    const rows = parseCsv(toLibraryCsv(list, 'Europe/Berlin'));
    expect(rows[0]).toEqual([...LIBRARY_COLUMNS]);
    expect(rows).toHaveLength(list.length + 1);
    expect(rows.slice(1).map((r) => r[1])).toEqual(['b-1', 'm-s1', 'm-a', 'm-b', 'm-q1', 'm-q2']);
  });

  it('fills positions, dates in the user time zone, franchise, tags and notes', () => {
    const rows = parseCsv(toLibraryCsv(list, 'Europe/Berlin'));
    const col = (row: string[], name: (typeof LIBRARY_COLUMNS)[number]) => row[LIBRARY_COLUMNS.indexOf(name)];
    const byTitle = new Map(rows.slice(1).map((r) => [r[1], r]));

    const book = byTitle.get('b-1')!;
    expect(col(book, 'section')).toBe('books');
    expect(col(book, 'status')).toBe('CONSUMING');
    expect(col(book, 'progress')).toBe('120');
    expect(col(book, 'started')).toBe('2026-01-05');
    expect(col(book, 'finished')).toBe('');
    expect(col(book, 'franchise')).toBe('Dune');
    expect(col(book, 'tags')).toBe('sci-fi; classic');
    expect(col(book, 'notes')).toBe('Great, "really"\ngreat');

    const best = byTitle.get('m-a')!;
    expect([col(best, 'tier'), col(best, 'tier position'), col(best, 'score'), col(best, 'favourite')]).toEqual([
      'S',
      '2',
      '9.5',
      'yes',
    ]);
    expect(col(byTitle.get('m-q2')!, 'queue position')).toBe('2');
    expect(col(byTitle.get('m-q2')!, 'tier position')).toBe('');
    expect(col(book, 'externalId')).toBe('ext-b-1');
  });

  it('leaves a tier off a title that is not on the tier list', () => {
    const rows = parseCsv(toLibraryCsv([exp({ id: 'x', status: 'PLANNED', tier: 'S' })], 'UTC'));
    expect(rows[1][LIBRARY_COLUMNS.indexOf('tier')]).toBe('');
  });
});

describe('toFranchisesCsv', () => {
  it('ranks manually ordered franchises first and lists members', () => {
    const csv = toFranchisesCsv([
      { name: 'Zelda', rating: null, rankOrder: null, notes: null, members: [] },
      {
        name: 'Dune',
        rating: 9,
        rankOrder: 1000,
        notes: 'spice',
        members: [
          { category: 'books', title: 'Dune', year: 1965, status: 'COMPLETED', rating: 9 },
          { category: 'movies', title: 'Dune, Part Two', year: null, status: 'PLANNED', rating: null },
        ],
      },
    ]);
    expect(parseCsv(csv)).toEqual([
      ['franchise', 'rank', 'franchise score', 'titles', 'members', 'notes'],
      ['Dune', '1', '9', '2', 'Dune (1965) [books]; Dune, Part Two [movies]', 'spice'],
      ['Zelda', '', '', '0', '', ''],
    ]);
  });
});

describe('exportablePrefs', () => {
  it('drops push URLs and the calendar token', () => {
    const prefs = parsePrefs({
      scoreFormat: 'five',
      calendarToken: 'secret-token',
      notify: { ntfyUrl: 'https://ntfy.sh/my-topic', discordWebhook: null, kinds: ['releases'] },
    });
    const out = exportablePrefs(prefs);
    const text = JSON.stringify(out);
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('my-topic');
    expect(out.scoreFormat).toBe('five');
    expect(out.notify).toEqual({ kinds: ['releases'], ntfyConfigured: true, discordConfigured: false });
  });
});

describe('exportFilename', () => {
  it('is dated in the user time zone', () => {
    const now = new Date('2026-10-27T23:30:00Z');
    expect(exportFilename('library', 'csv', 'Europe/Berlin', now)).toBe('hoard-library-2026-10-28.csv');
    expect(exportFilename('all', 'json', 'UTC', now)).toBe('hoard-all-2026-10-27.json');
  });
});
