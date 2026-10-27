import { describe, expect, it } from 'vitest';
import {
  formatRating,
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
