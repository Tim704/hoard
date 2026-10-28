import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { mapAniListCollection, validAniListUser, type AniListCollection } from './sources/anilist';
import { cleanReview, parseGoodreads, shelfStatus, stripSeries } from './sources/goodreads';
import { parseHoardCsv } from './sources/hoard';
import { letterboxdKind, parseLetterboxd, readLetterboxdZip } from './sources/letterboxd';
import { lastReadRange, parseStoryGraph } from './sources/storygraph';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

describe('Hoard CSV', () => {
  const { rows, skipped } = parseHoardCsv(fixture('hoard-library.csv'));

  it('reads every valid row and skips unknown sections and statuses', () => {
    expect(rows.map((r) => r.title)).toEqual([
      'Parasite',
      '=SUM(A1) Spreadsheets for Fun',
      'Cowboy Bebop',
      'Hand Made',
    ]);
    expect(skipped).toBe(2);
  });

  it('undoes the formula escape on every text cell', () => {
    const book = rows.find((r) => r.category === 'books')!;
    expect(book.title).toBe('=SUM(A1) Spreadsheets for Fun');
    expect(book.notes).toBe('-not a formula');
    expect(book.externalId).toBe('/works/OL123W');
    expect(book.status).toBe('PLANNED');
  });

  it('keeps scores (0 included), tags, days, progress and quoted notes', () => {
    const parasite = rows.find((r) => r.title === 'Parasite')!;
    expect(parasite).toMatchObject({
      category: 'movies',
      year: 2019,
      status: 'COMPLETED',
      rating: 9.5,
      tags: ['cinema', 'korea'],
      finishedOn: '2023-01-04',
      notes: 'Loved it, twice.',
      externalId: '496243',
      favourite: true,
    });
    const bebop = rows.find((r) => r.title === 'Cowboy Bebop')!;
    expect(bebop).toMatchObject({ rating: 0, progress: 12, startedOn: '2024-05-01', notes: 'multi\r\nline note' });
    expect(bebop.finishedOn).toBeUndefined();
    expect(bebop.favourite).toBeUndefined();
  });

  it('collapses a duplicated row', () => {
    expect(rows.filter((r) => r.title === 'Parasite')).toHaveLength(1);
  });

  it('keeps a RETIRED status and a manual id', () => {
    expect(rows.find((r) => r.title === 'Hand Made')).toMatchObject({ status: 'RETIRED', externalId: 'manual:cabc123', rating: 7 });
  });

  it('rejects another CSV', () => {
    const res = parseHoardCsv('Title,Author\nX,Y\n');
    expect(res.rows).toEqual([]);
    expect(res.warnings[0]).toMatch(/not a Hoard/);
  });
});

describe('AniList', () => {
  const json = JSON.parse(fixture('anilist-collection.json')) as { data: { MediaListCollection: AniListCollection } };
  const { rows, skipped } = mapAniListCollection([json.data.MediaListCollection], 'ANIME');
  const byId = (id: string) => rows.find((r) => r.ids.anilist === id)!;

  it('maps each status', () => {
    expect(byId('11759').status).toBe('COMPLETED');
    expect(byId('1').status).toBe('CONSUMING'); // REPEATING
    expect(byId('21').status).toBe('CONSUMING'); // CURRENT
    expect(byId('20').status).toBe('ON_HOLD');
    expect(byId('5114').status).toBe('PLANNED');
    expect(byId('30').status).toBe('DROPPED');
  });

  it('lists a title once, with custom lists as tags, and skips entries without media', () => {
    expect(rows).toHaveLength(7);
    expect(skipped).toBe(1);
    expect(byId('11759').tags).toEqual(['Comfy favourites']);
    expect(byId('21').tags).toEqual(['Comfy favourites']);
  });

  it('keeps ids, the English title, the year, dates, progress and scores (0 = unscored)', () => {
    expect(byId('11759')).toMatchObject({
      category: 'anime',
      title: 'Accel World',
      year: 2012,
      ids: { anilist: '11759', mal: '11759' },
      rating: 8.5,
      progress: 24,
      startedOn: '2023-01-02',
      finishedOn: '2023-03-30',
    });
    const special = byId('170000');
    expect(special.title).toBe('Kimi no Na wa. Special');
    expect(special.ids.mal).toBeUndefined();
    expect(special.year).toBe(2017);
    expect(special.rating).toBeUndefined();
    expect(special.startedOn).toBeUndefined(); // only a year: not a day
    expect(special.rewatchCount).toBe(2);
    expect(special.notes).toBe('watched with friends');
    expect(byId('21').progress).toBeUndefined();
    expect(byId('5114').title).toBe('Fullmetal Alchemist: Brotherhood');
  });

  it('notes a rewatch in progress', () => {
    expect(byId('1').rewatchCount).toBe(2); // one finished repeat + the current one
  });

  it('maps manga lists to the manga section', () => {
    const res = mapAniListCollection([json.data.MediaListCollection], 'MANGA');
    expect(res.rows.every((r) => r.category === 'manga')).toBe(true);
  });

  it('validates usernames', () => {
    expect(validAniListUser('Ichigo_kun')).toBe(true);
    expect(validAniListUser('a')).toBe(false);
    expect(validAniListUser('bad name')).toBe(false);
  });
});

describe('Letterboxd', () => {
  const files = ['watched', 'ratings', 'diary', 'reviews', 'watchlist'].map((k) => ({
    name: `${k}.csv`,
    text: fixture(`letterboxd-${k}.csv`),
  }));

  it('recognises files by name, or by their columns when renamed', () => {
    expect(letterboxdKind('export/watchlist.csv', ['Date', 'Name', 'Year', 'Letterboxd URI'])).toBe('watchlist');
    expect(letterboxdKind('x.csv', ['Date', 'Name', 'Year', 'Rating', 'Watched Date'])).toBe('diary');
    expect(letterboxdKind('x.csv', ['Date', 'Name', 'Year', 'Letterboxd URI'])).toBeNull();
    expect(letterboxdKind('watched.csv', ['Title'])).toBeNull();
  });

  it('dedupes a film across files, keeping the richest data', () => {
    const { rows } = parseLetterboxd(files);
    expect(rows.map((r) => r.title).sort()).toEqual(['Crouching Tiger, Hidden Dragon', 'Heat', 'Parasite', 'Perfect Days']);
    const parasite = rows.find((r) => r.title === 'Parasite')!;
    expect(parasite).toMatchObject({
      status: 'COMPLETED',
      year: 2019,
      rating: 9, // ratings.csv (4.5★) wins over a single diary entry's 5★
      finishedOn: '2024-05-31',
      rewatchCount: 1,
      tags: ['cinema', 'korea'],
      review: 'Even better twice.\nThat "peach" scene, wow.',
    });
    expect(parasite.diary).toEqual([
      { date: '2023-01-04', rating: 9, rewatch: false },
      { date: '2024-05-31', rating: 10, rewatch: true, review: 'Even better twice.\nThat "peach" scene, wow.' },
    ]);
  });

  it('watched beats watchlist, empty ratings stay unrated, watchlist duplicates collapse', () => {
    const { rows } = parseLetterboxd(files);
    const heat = rows.find((r) => r.title === 'Heat')!;
    expect(heat.status).toBe('COMPLETED');
    expect(heat.rating).toBeUndefined();
    expect(heat.finishedOn).toBe('2023-02-02'); // the diary's Watched Date, not watched.csv's logging Date
    expect(rows.find((r) => r.title.startsWith('Crouching'))!.finishedOn).toBeUndefined();
    const perfect = rows.filter((r) => r.title === 'Perfect Days');
    expect(perfect).toHaveLength(1);
    expect(perfect[0]).toMatchObject({ status: 'PLANNED', year: 2023 });
    expect(perfect[0].finishedOn).toBeUndefined();
    expect(rows.find((r) => r.title.startsWith('Crouching'))!.rating).toBe(6);
  });

  it('half stars double cleanly', () => {
    const { rows } = parseLetterboxd([{ name: 'ratings.csv', text: 'Date,Name,Year,Letterboxd URI,Rating\n2020-01-01,A,2000,u,0.5\n2020-01-01,B,2000,u,2.5\n' }]);
    expect(rows.map((r) => r.rating)).toEqual([1, 5]);
  });

  it('warns about a file that is not from Letterboxd', () => {
    const { rows, warnings } = parseLetterboxd([{ name: 'profile.csv', text: 'Username,Given Name\nx,y\n' }]);
    expect(rows).toEqual([]);
    expect(warnings[0]).toMatch(/profile\.csv/);
  });

  it('reads the export zip, ignoring the deleted/ folder and other files', () => {
    const zip = zipSync({
      'watched.csv': strToU8(fixture('letterboxd-watched.csv')),
      'watchlist.csv': strToU8(fixture('letterboxd-watchlist.csv')),
      'profile.csv': strToU8('Username\nx\n'),
      'deleted/watched.csv': strToU8('Date,Name,Year,Letterboxd URI\n2020-01-01,Gone,2001,u\n'),
    });
    const read = readLetterboxdZip(zip);
    expect(read.map((f) => f.name).sort()).toEqual(['watched.csv', 'watchlist.csv']);
    const { rows } = parseLetterboxd(read);
    expect(rows.some((r) => r.title === 'Gone')).toBe(false);
    expect(rows).toHaveLength(4);
  });
});

describe('Goodreads', () => {
  const { rows, skipped } = parseGoodreads(fixture('goodreads.csv'));
  const find = (t: string) => rows.find((r) => r.title === t)!;

  it('reads rows through a BOM, CRLF and quoted commas; skips a blank-title line; dedupes', () => {
    expect(rows.map((r) => r.title)).toEqual([
      'The Hunger Games',
      'The Way of Kings',
      'Dune',
      'Infinite Jest',
      'A Book, With Commas',
    ]);
    expect(skipped).toBe(1);
  });

  it('strips the ="…" ISBN wrapper and prefers ISBN13', () => {
    expect(find('The Hunger Games').ids).toEqual({ isbn: '9780439023481', isbn10: '0439023483' });
    expect(find('The Way of Kings').ids).toEqual({});
  });

  it('maps shelves to statuses and other shelves to tags', () => {
    expect(find('The Hunger Games')).toMatchObject({ status: 'COMPLETED', tags: ['favourites', 'ya'] });
    expect(find('The Way of Kings').status).toBe('CONSUMING');
    expect(find('The Way of Kings').tags).toBeUndefined();
    expect(find('A Book, With Commas').status).toBe('PLANNED');
    expect(find('Infinite Jest')).toMatchObject({ status: 'DROPPED', tags: ['did-not-finish', 'doorstoppers'] });
  });

  it('doubles ratings, treats 0 as unrated, keeps dates, rereads, author, year and review', () => {
    expect(find('The Hunger Games')).toMatchObject({
      rating: 8,
      finishedOn: '2024-03-09',
      rewatchCount: 1,
      author: 'Suzanne Collins',
      year: 2008,
      review: 'Gripping.\nRead it in one sitting, honestly.',
    });
    expect(find('The Way of Kings').rating).toBeUndefined();
    expect(find('Dune')).toMatchObject({ rating: 10, year: 1965, review: '"Fear is the mind-killer," he said.' });
    expect(find('A Book, With Commas').rating).toBe(6);
  });

  it('helpers', () => {
    expect(stripSeries('Mistborn: The Final Empire (Mistborn, #1)')).toBe('Mistborn: The Final Empire');
    expect(stripSeries('Words of Radiance (The Stormlight Archive, #2.5)')).toBe('Words of Radiance');
    expect(stripSeries('(Untitled)')).toBe('(Untitled)');
    expect(shelfStatus('dnf')).toBe('DROPPED');
    expect(shelfStatus('on-hold')).toBe('ON_HOLD');
    expect(shelfStatus('wishlist')).toBe('PLANNED');
    expect(cleanReview('a<br/><b>b</b> &amp; c')).toBe('a\nb & c');
  });
});

describe('StoryGraph', () => {
  const { rows, skipped } = parseStoryGraph(fixture('storygraph.csv'));
  const find = (t: string) => rows.find((r) => r.title === t)!;

  it('maps read statuses, quarter-star ratings, tags and multi-line reviews', () => {
    expect(rows).toHaveLength(4);
    expect(skipped).toBe(0);
    expect(find('Piranesi')).toMatchObject({
      status: 'COMPLETED',
      rating: 8.5,
      ids: { isbn: '9781635575996' },
      author: 'Susanna Clarke',
      finishedOn: '2023-02-10',
      startedOn: '2023-02-01',
      rewatchCount: 1,
      tags: ['fantasy', 'cozy'],
      review: 'Strange, lovely.\nWould reread.',
    });
    expect(find('Project Hail Mary')).toMatchObject({ status: 'CONSUMING', ids: {}, author: 'Andy Weir' });
    expect(find('The Name of the Wind').status).toBe('DROPPED');
    expect(find('Untitled Thing')).toMatchObject({ status: 'PLANNED', rating: 7 });
  });

  it('reads the last Dates Read range', () => {
    expect(lastReadRange('2021/05/01-2021/05/09, 2023/02/01-2023/02/10')).toEqual({ start: '2023-02-01', end: '2023-02-10' });
    expect(lastReadRange('')).toEqual({});
  });
});
