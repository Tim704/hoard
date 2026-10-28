import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { gzipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';

import traktProfile from './__fixtures__/trakt-profile.json';
import { csvRecords } from './csv';
import {
  buildStatusMap,
  defaultStatusFor,
  distinctValues,
  guessMapping,
  headerSignature,
  initialMapping,
  loadMapping,
  mapGenericRecords,
  MAPPING_KEY_PREFIX,
  restoreMapping,
  saveMapping,
  scaledRating,
  sectionFromCell,
} from './sources/generic';
import { decodeXmlText, malExportText, parseMalXml, readXmlRecords } from './sources/mal';
import { mapTraktData, traktErrorMessage, traktUserFromInput, validTraktUser, type TraktData } from './sources/trakt';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

describe('MyAnimeList XML', () => {
  const anime = parseMalXml(fixture('mal-animelist.xml'));

  it('reads every entry with a known status and skips the rest', () => {
    expect(anime.rows.map((r) => r.title)).toEqual([
      'Cowboy Bebop',
      'Fullmetal Alchemist: Brotherhood',
      'One Punch Man & Friends',
      'Naruto',
      'One Piece',
    ]);
    expect(anime.skipped).toBe(1);
    expect(anime.rows.every((r) => r.source === 'mal' && r.category === 'anime')).toBe(true);
  });

  it('maps statuses, scores, progress, dates, rewatches, tags and comments', () => {
    const [bebop, fma, opm, naruto, onePiece] = anime.rows;
    expect(bebop).toMatchObject({
      ids: { mal: '1' },
      status: 'COMPLETED',
      rating: 9,
      progress: 26,
      startedOn: '2020-01-05',
      finishedOn: '2020-02-10',
      rewatchCount: 2,
      tags: ['classic', 'space'],
      notes: 'See you, space cowboy & co.',
    });
    expect(fma.status).toBe('CONSUMING');
    expect(opm.status).toBe('PLANNED');
    expect(naruto).toMatchObject({ status: 'DROPPED', rating: 4 });
    expect(onePiece.status).toBe('ON_HOLD');
  });

  it('treats 0000-00-00 and partial dates as none, and a 0 score as unrated', () => {
    const fma = anime.rows[1];
    expect(fma.startedOn).toBeUndefined();
    expect(fma.finishedOn).toBeUndefined();
    expect(fma.rating).toBeUndefined();
    expect(fma.rewatchCount).toBeUndefined();
    expect(fma.tags).toBeUndefined();
    expect(fma.notes).toBeUndefined();
    expect(anime.rows[2].progress).toBeUndefined();
  });

  it('reads manga lists, gzipped too', () => {
    const bytes = gzipSync(strToU8(fixture('mal-mangalist.xml')));
    const manga = parseMalXml(malExportText(bytes));
    expect(manga.rows).toEqual([
      expect.objectContaining({
        category: 'manga',
        title: 'Berserk',
        ids: { mal: '2' },
        status: 'CONSUMING',
        rating: 10,
        progress: 370,
        startedOn: '2019-07-01',
      }),
      expect.objectContaining({ title: 'One Piece', ids: { mal: '13' }, status: 'PLANNED' }),
    ]);
    expect(manga.rows[1].rating).toBeUndefined();
    // Plain XML passes through untouched.
    expect(malExportText(strToU8('<myanimelist/>'))).toBe('<myanimelist/>');
  });

  it('refuses a file that is not a MAL export', () => {
    expect(parseMalXml('<rss><item/></rss>').warnings[0]).toMatch(/not a MyAnimeList export/);
  });

  it('reads child elements, CDATA, entities and self-closing tags', () => {
    const recs = readXmlRecords(
      '<x><anime><a>1 &lt; 2 &#38; &#x41;</a><b/><c><![CDATA[<raw> & ]]>tail</c><!-- note --></anime></x>',
      'anime',
    );
    expect(recs).toEqual([{ a: '1 < 2 & A', b: '', c: '<raw> & tail' }]);
    expect(decodeXmlText('a &unknown; b')).toBe('a &unknown; b');
  });
});

describe('Trakt', () => {
  const { rows, skipped } = mapTraktData(traktProfile as TraktData, 'Europe/Berlin');
  const byTitle = (t: string) => rows.find((r) => r.title === t)!;

  it('gives one row per title, keyed by TMDB id', () => {
    expect(rows.map((r) => r.title)).toEqual([
      'Batman Begins',
      'The Dark Knight',
      'Breaking Bad',
      'Parks and Recreation',
      'TRON: Legacy',
      'Heat',
      'The Wire',
    ]);
    expect(skipped).toBe(1);
    expect(rows.every((r) => r.source === 'trakt' && r.ids.tmdb)).toBe(true);
  });

  it('watched films: Completed, rewatches from plays, last watch as a day in the user zone', () => {
    expect(byTitle('Batman Begins')).toMatchObject({
      category: 'movies',
      year: 2005,
      status: 'COMPLETED',
      rewatchCount: 3,
      // 23:30 UTC is already the next day in Berlin.
      finishedOn: '2014-10-12',
      ids: { tmdb: '272', imdb: 'tt0372784' },
    });
    expect(byTitle('The Dark Knight')).toMatchObject({ rating: 10, finishedOn: '2014-10-12' });
    expect(byTitle('The Dark Knight').rewatchCount).toBeUndefined();
  });

  it('shows: Completed only when every aired episode of an ended show is watched', () => {
    expect(byTitle('Breaking Bad')).toMatchObject({ category: 'tv', status: 'COMPLETED', progress: 3, finishedOn: '2014-10-11' });
    // Rated, but only 2 of 125 episodes: still Ongoing, with the score.
    expect(byTitle('Parks and Recreation')).toMatchObject({ status: 'CONSUMING', progress: 2, rating: 8 });
    expect(byTitle('Parks and Recreation').finishedOn).toBeUndefined();
  });

  it('ratings without a watch are Completed; the watchlist is Planned with its note', () => {
    expect(byTitle('TRON: Legacy')).toMatchObject({ status: 'COMPLETED', rating: 7, notes: 'Need to catch up before TRON 3 is out.' });
    expect(byTitle('Heat')).toMatchObject({ status: 'PLANNED', category: 'movies' });
    expect(byTitle('The Wire')).toMatchObject({ status: 'PLANNED', category: 'tv', ids: { tmdb: '1438', imdb: 'tt0306414' } });
  });

  it('reads usernames and profile links, and words errors kindly', () => {
    expect(traktUserFromInput('https://trakt.tv/users/sean/history')).toBe('sean');
    expect(traktUserFromInput(' @sean ')).toBe('sean');
    expect(validTraktUser('sean')).toBe(true);
    expect(validTraktUser('bad name')).toBe(false);
    expect(validTraktUser('../x')).toBe(false);
    expect(traktErrorMessage(404, 'x')).toMatch(/No Trakt user/);
    expect(traktErrorMessage(401, 'x')).toMatch(/private/);
    expect(traktErrorMessage(403, 'x')).toMatch(/TRAKT_CLIENT_ID/);
  });
});

describe('generic CSV', () => {
  const { headers, records } = csvRecords(fixture('backloggd.csv'));

  it('guesses columns from header names', () => {
    expect(guessMapping(headers).columns).toEqual({
      title: 'Name',
      year: 'Release Year',
      status: 'Status',
      rating: 'Rating',
      platform: 'Platform',
      date: 'Date Played',
    });
  });

  it('defaults status words sensibly (Backloggd included)', () => {
    expect(defaultStatusFor('Played')).toBe('COMPLETED');
    expect(defaultStatusFor('Beaten')).toBe('COMPLETED');
    expect(defaultStatusFor('Completed')).toBe('COMPLETED');
    expect(defaultStatusFor('Playing')).toBe('CONSUMING');
    expect(defaultStatusFor('Backlog')).toBe('PLANNED');
    expect(defaultStatusFor('Wishlist')).toBe('PLANNED');
    expect(defaultStatusFor('Plan to Play')).toBe('PLANNED');
    expect(defaultStatusFor('want to read')).toBe('PLANNED');
    expect(defaultStatusFor('Abandoned')).toBe('DROPPED');
    expect(defaultStatusFor('Dropped')).toBe('DROPPED');
    expect(defaultStatusFor('Retired')).toBe('RETIRED');
    expect(defaultStatusFor('Shelved')).toBe('RETIRED');
    expect(defaultStatusFor('Paused')).toBe('ON_HOLD');
    expect(defaultStatusFor('On hold')).toBe('ON_HOLD');
    expect(defaultStatusFor('ON_HOLD')).toBe('ON_HOLD');
    expect(defaultStatusFor('unplayed')).toBe('PLANNED');
    expect(defaultStatusFor('¯\\_(ツ)_/¯')).toBeNull();
  });

  it('maps rows with a fixed section, a 5-point scale, platforms as tags and dates by status', () => {
    const base = guessMapping(headers);
    const values = distinctValues(records, base.columns.status);
    expect(values).toEqual(['Completed', 'Playing', 'Backlog', 'Abandoned', 'Shelved', 'Wishlist', 'On Hold', 'Played', 'Beaten']);
    const statusMap = buildStatusMap(values);
    const mapping = { ...base, section: 'games' as const, scale: 5 as const, statusMap: { ...statusMap, wishlist: 'skip' as const } };
    const { rows, skipped } = mapGenericRecords(records, mapping);
    expect(skipped).toBe(2); // no title; Wishlist skipped
    const by = (t: string) => rows.find((r) => r.title === t)!;
    expect(by('Hollow Knight')).toEqual({
      source: 'generic',
      category: 'games',
      title: 'Hollow Knight',
      ids: {},
      status: 'COMPLETED',
      year: 2017,
      rating: 9,
      tags: ['PC'],
      finishedOn: '2023-03-04',
    });
    expect(by('Elden Ring')).toMatchObject({ status: 'CONSUMING', tags: ['PS5', 'PC'], startedOn: '2024-01-10' });
    expect(by('Elden Ring').rating).toBeUndefined();
    expect(by('Celeste')).toMatchObject({ status: 'PLANNED' });
    expect(by('Celeste').finishedOn).toBeUndefined();
    expect(by('Death Stranding')).toMatchObject({ status: 'DROPPED', rating: 4, finishedOn: '2022-11-02' });
    expect(by('Disco Elysium')).toMatchObject({ status: 'RETIRED', rating: 7 });
    expect(by('Tunic')).toMatchObject({ status: 'ON_HOLD', startedOn: '2023-05-05' });
  });

  it('reads sections from a column, and scales 10 and 100', () => {
    const recs = [
      { T: 'Dune', S: 'Book', R: '85' },
      { T: 'Heat', S: 'Film', R: '100' },
      { T: 'Akira', S: 'Manga', R: '0' },
      { T: '???', S: 'Podcast', R: '' },
    ];
    const m = { columns: { title: 'T', section: 'S', rating: 'R' }, section: null, scale: 100 as const, statusMap: {}, defaultStatus: 'COMPLETED' as const };
    const out = mapGenericRecords(recs, m);
    expect(out.rows.map((r) => [r.title, r.category, r.rating])).toEqual([
      ['Dune', 'books', 8.5],
      ['Heat', 'movies', 10],
      ['Akira', 'manga', undefined],
    ]);
    expect(out.warnings[0]).toMatch(/1 row had no recognisable section/);
    expect(sectionFromCell('TV Shows')).toBe('tv');
    expect(sectionFromCell('video game')).toBe('games');
    expect(scaledRating('8/10', 10)).toBe(8);
    expect(scaledRating('11', 10)).toBeUndefined();
  });

  it('remembers the mapping per header set, ignoring order, case and bad entries', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(initialMapping(storage, headers).remembered).toBe(false);
    const mapping = { ...guessMapping(headers), section: 'games' as const, scale: 5 as const, statusMap: { shelved: 'DROPPED' as const } };
    saveMapping(storage, headers, mapping);

    const shuffled = [...headers].reverse().map((h) => h.toUpperCase());
    expect(headerSignature(shuffled)).toBe(headerSignature(headers));
    const back = initialMapping(storage, headers);
    expect(back).toEqual({ mapping, remembered: true });
    // Stored choices win over the word defaults.
    expect(buildStatusMap(['Shelved', 'Played'], back.mapping.statusMap)).toEqual({ shelved: 'DROPPED', played: 'COMPLETED' });

    // A different header set has its own (no) memory.
    expect(loadMapping(storage, ['Title', 'Score'])).toBeNull();
    // Columns missing from the file are dropped; junk is ignored, never thrown.
    expect(restoreMapping({ columns: { title: 'Gone', year: 'Release Year' }, scale: 7, statusMap: { a: 'NOPE', b: 'skip' } }, headers)).toEqual({
      columns: { year: 'Release Year' },
      section: null,
      scale: 10,
      statusMap: { b: 'skip' },
      defaultStatus: 'COMPLETED',
    });
    store.set(`${MAPPING_KEY_PREFIX}${headerSignature(headers)}`, '{not json');
    expect(loadMapping(storage, headers)).toBeNull();
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
    expect(loadMapping(throwing, headers)).toBeNull();
    expect(() => saveMapping(throwing, headers, mapping)).not.toThrow();
  });
});
