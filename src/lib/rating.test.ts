import { describe, expect, it } from 'vitest';
import {
  formatRating,
  formatScore,
  formatScoreDiff,
  formatScoreOutOf,
  normalizeRating,
  nudgeRating,
  parseRatingInput,
} from './rating';

describe('normalizeRating', () => {
  it('rounds to one decimal and enforces 0-10', () => {
    expect(normalizeRating(8)).toBe(8);
    expect(normalizeRating(7.25)).toBe(7.3);
    expect(normalizeRating(10.04)).toBe(10);
    expect(normalizeRating(10.05)).toBeNull();
    expect(normalizeRating(-0.1)).toBeNull();
    expect(normalizeRating(NaN)).toBeNull();
  });
});

describe('parseRatingInput', () => {
  it('accepts . or , and rejects bad input', () => {
    expect(parseRatingInput(' 8,5 ')).toBe(8.5);
    expect(parseRatingInput('10.05')).toBeNull();
    expect(parseRatingInput('')).toBeNull();
    expect(parseRatingInput('-1')).toBeNull();
    expect(parseRatingInput('abc')).toBeNull();
  });
});

describe('nudgeRating', () => {
  it('clamps, treats null as 0 and avoids float drift', () => {
    expect(nudgeRating(null, 0.1)).toBe(0.1);
    expect(nudgeRating(9.95, 0.1)).toBe(10);
    expect(nudgeRating(0, -0.1)).toBe(0);
    expect(nudgeRating(7.9, 0.1)).toBe(8);
  });
});

describe('formatRating', () => {
  it('formats with one decimal or a dash', () => {
    expect(formatRating(8)).toBe('8.0');
    expect(formatRating(7.5)).toBe('7.5');
    expect(formatRating(null)).toBe('—');
  });
});

describe('formatScore', () => {
  it('ten: one decimal', () => {
    expect(formatScore(8.5, 'ten')).toBe('8.5');
    expect(formatScore(8, 'ten')).toBe('8.0');
    expect(formatScore(8)).toBe('8.0');
  });

  it('five: half the score to one decimal, with a star', () => {
    expect(formatScore(8.5, 'five')).toBe('4.3★');
    expect(formatScore(8.4, 'five')).toBe('4.2★');
    expect(formatScore(8.3, 'five')).toBe('4.2★');
    expect(formatScore(10, 'five')).toBe('5.0★');
    expect(formatScore(0, 'five')).toBe('0.0★');
    expect(formatScore(0.1, 'five')).toBe('0.1★');
  });

  it('hundred: whole number', () => {
    expect(formatScore(8.5, 'hundred')).toBe('85');
    expect(formatScore(10, 'hundred')).toBe('100');
    expect(formatScore(0.1, 'hundred')).toBe('1');
    expect(formatScore(7.3, 'hundred')).toBe('73');
  });

  it('a dash when unrated', () => {
    expect(formatScore(null, 'five')).toBe('—');
    expect(formatScore(NaN, 'hundred')).toBe('—');
  });

  it('formatScoreOutOf adds the scale', () => {
    expect(formatScoreOutOf(8.5, 'ten')).toBe('8.5/10');
    expect(formatScoreOutOf(8.5, 'five')).toBe('4.3★');
    expect(formatScoreOutOf(8.5, 'hundred')).toBe('85/100');
    expect(formatScoreOutOf(null, 'hundred')).toBe('—');
  });

  it('star: false drops the ★ where an icon is already drawn', () => {
    expect(formatScore(8.5, 'five', { star: false })).toBe('4.3');
    expect(formatScore(8.5, 'ten', { star: false })).toBe('8.5');
    expect(formatScore(8.5, 'hundred', { star: false })).toBe('85');
    expect(formatScore(null, 'five', { star: false })).toBe('—');
    expect(formatScoreOutOf(8.5, 'five', { star: false })).toBe('4.3/5');
    expect(formatScoreOutOf(8.5, 'ten', { star: false })).toBe('8.5/10');
    expect(formatScoreOutOf(8.5, 'hundred', { star: false })).toBe('85/100');
  });
});

describe('formatScoreDiff', () => {
  it('signs the difference in each format', () => {
    expect(formatScoreDiff(1.5)).toBe('+1.5');
    expect(formatScoreDiff(-5.5, 'ten')).toBe('−5.5');
    expect(formatScoreDiff(1.5, 'five')).toBe('+0.8');
    expect(formatScoreDiff(-1, 'five')).toBe('−0.5');
    expect(formatScoreDiff(1.5, 'hundred')).toBe('+15');
    expect(formatScoreDiff(0.04)).toBe('±0');
    expect(formatScoreDiff(Number.NaN)).toBe('—');
  });
});
