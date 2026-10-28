import { describe, expect, it } from 'vitest';

import { parseSubScores, SUBSCORE_KEYS, subScoreAverage } from './subscores';

describe('sub-score categories', () => {
  it('match the spec per medium', () => {
    expect(SUBSCORE_KEYS.movies).toEqual(['story', 'characters', 'visuals', 'audio', 'enjoyment']);
    expect(SUBSCORE_KEYS.anime).toEqual(SUBSCORE_KEYS.tv);
    expect(SUBSCORE_KEYS.games).toEqual(['gameplay', 'story', 'visuals', 'audio', 'enjoyment']);
    expect(SUBSCORE_KEYS.books).toEqual(['writing', 'story', 'characters', 'enjoyment']);
    expect(SUBSCORE_KEYS.manga).toEqual(SUBSCORE_KEYS.books);
    expect(SUBSCORE_KEYS.music).toEqual(['songs', 'production', 'enjoyment']);
  });
});

describe('parseSubScores', () => {
  it('keeps only the section keys with valid scores, rounded', () => {
    expect(
      parseSubScores('music', { songs: 8.26, production: 11, enjoyment: '7', story: 5, toString: 3 }),
    ).toEqual({ songs: 8.3 });
  });
  it('ignores non-objects', () => {
    expect(parseSubScores('books', null)).toEqual({});
    expect(parseSubScores('books', [1, 2])).toEqual({});
    expect(parseSubScores('books', 'x')).toEqual({});
  });
  it('accepts 0 and 10', () => {
    expect(parseSubScores('games', { gameplay: 0, audio: 10 })).toEqual({ gameplay: 0, audio: 10 });
  });
});

describe('subScoreAverage', () => {
  it('is null without scores', () => {
    expect(subScoreAverage({})).toBeNull();
    expect(subScoreAverage(null)).toBeNull();
  });
  it('averages the given scores to one decimal', () => {
    expect(subScoreAverage({ story: 8, visuals: 9 })).toBe(8.5);
    expect(subScoreAverage({ story: 7, visuals: 8, audio: 8 })).toBe(7.7);
    expect(subScoreAverage({ songs: 10 })).toBe(10);
  });
  it('rounds without float drift', () => {
    expect(subScoreAverage({ a: 7.1, b: 7.2 } as never)).toBe(7.2);
  });
});
