import { describe, expect, it } from 'vitest';

import {
  coverUrlProblem,
  isManualId,
  manualInputFrom,
  manualResult,
  parseManualInput,
} from './manual';

describe('parseManualInput', () => {
  it('requires a title', () => {
    expect(parseManualInput('movies', { title: '   ' })).toEqual({
      ok: false,
      error: 'A title is required.',
    });
  });

  it('returns every column the form owns, empty ones as null / []', () => {
    const res = parseManualInput('books', { title: ' Dune ', year: '1965', authors: 'Frank Herbert,  , Frank Herbert' });
    expect(res).toEqual({
      ok: true,
      fields: {
        title: 'Dune',
        year: 1965,
        imageUrl: null,
        description: null,
        authors: ['Frank Herbert'],
        pageCount: null,
      },
    });
  });

  it('parses the medium counts as whole numbers', () => {
    const res = parseManualInput('tv', { title: 'Show', episodeCount: '24', seasonCount: '2' });
    expect(res.ok && res.fields).toMatchObject({ episodeCount: 24, seasonCount: 2 });
    expect(parseManualInput('tv', { title: 'Show', episodeCount: '2.5' })).toMatchObject({ ok: false });
    expect(parseManualInput('tv', { title: 'Show', episodeCount: '-1' })).toMatchObject({ ok: false });
  });

  it('keeps music artist as text and games platforms as a list', () => {
    const music = parseManualInput('music', { title: 'LP', artist: ' Band ', trackCount: '10' });
    expect(music.ok && music.fields).toMatchObject({ artist: 'Band', trackCount: 10 });
    const game = parseManualInput('games', { title: 'G', platforms: 'PC, Switch' });
    expect(game.ok && game.fields).toMatchObject({ platforms: ['PC', 'Switch'] });
  });

  it('rejects bad years', () => {
    expect(parseManualInput('movies', { title: 'M', year: '99' })).toMatchObject({ ok: false });
    expect(parseManualInput('movies', { title: 'M', year: '1999a' })).toMatchObject({ ok: false });
  });

  it('only accepts https cover URLs', () => {
    expect(parseManualInput('movies', { title: 'M', imageUrl: 'http://x.org/a.jpg' })).toMatchObject({ ok: false });
    expect(parseManualInput('movies', { title: 'M', imageUrl: 'javascript:alert(1)' })).toMatchObject({ ok: false });
    const ok = parseManualInput('movies', { title: 'M', imageUrl: 'https://x.org/a.jpg' });
    expect(ok.ok && ok.fields.imageUrl).toBe('https://x.org/a.jpg');
  });

  it('ignores fields of other media and junk input', () => {
    const res = parseManualInput('movies', { title: 'M', pageCount: '300', tmdbRating: '9' });
    expect(res.ok && Object.keys(res.fields).sort()).toEqual(['description', 'imageUrl', 'runtime', 'title', 'year']);
    expect(parseManualInput('movies', null)).toMatchObject({ ok: false });
  });
});

describe('helpers', () => {
  it('coverUrlProblem', () => {
    expect(coverUrlProblem('https://a.b/c.png')).toBeNull();
    expect(coverUrlProblem('ftp://a.b/c.png')).not.toBeNull();
    expect(coverUrlProblem('not a url')).not.toBeNull();
  });

  it('isManualId', () => {
    expect(isManualId('manual:abc')).toBe(true);
    expect(isManualId('603')).toBe(false);
  });

  it('round-trips a row through the edit form', () => {
    const media = { title: 'Dune', year: 1965, imageUrl: null, description: 'Sand', authors: ['A', 'B'], pageCount: 412 };
    const input = manualInputFrom('books', media);
    expect(input).toEqual({ title: 'Dune', year: '1965', imageUrl: '', description: 'Sand', authors: 'A, B', pageCount: '412' });
    const res = parseManualInput('books', input);
    expect(res.ok && res.fields).toEqual(media);
  });

  it('manualResult carries the externalId in the column payload', () => {
    const r = manualResult('manual:x', { title: 'T', year: 2000, imageUrl: null, description: null });
    expect(r).toMatchObject({ externalId: 'manual:x', title: 'T', year: 2000 });
    expect(r.fields.externalId).toBe('manual:x');
  });
});
