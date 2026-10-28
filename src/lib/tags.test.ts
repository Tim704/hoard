import { describe, expect, it } from 'vitest';

import {
  addTags,
  countTags,
  hasAllTags,
  MAX_TAGS,
  normalizeTag,
  normalizeTags,
  removeTag,
  suggestTags,
} from './tags';

describe('normalizeTag', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeTag('  comfort \t  watch\n')).toBe('comfort watch');
  });
  it('returns null for blank input', () => {
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag('')).toBeNull();
  });
  it('caps at 40 characters and trims the cut', () => {
    const long = 'a'.repeat(39) + ' bcdef';
    expect(normalizeTag(long)).toBe('a'.repeat(39));
    expect(normalizeTag('x'.repeat(60))).toHaveLength(40);
  });
});

describe('normalizeTags', () => {
  it('dedupes case-insensitively keeping the first spelling', () => {
    expect(normalizeTags(['Sci-Fi', 'sci-fi', ' SCI-FI ', 'comfort'])).toEqual(['Sci-Fi', 'comfort']);
  });
  it('drops blanks and non-strings', () => {
    expect(normalizeTags(['', '  ', 3, null, 'ok'])).toEqual(['ok']);
  });
  it('keeps at most 20 tags', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag ${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
    expect(normalizeTags(many)[19]).toBe('tag 19');
  });
});

describe('addTags / removeTag', () => {
  it('splits typed text on commas', () => {
    expect(addTags(['a'], 'b, c ,, A')).toEqual(['a', 'b', 'c']);
  });
  it('removes case-insensitively', () => {
    expect(removeTag(['Sci-Fi', 'cosy'], 'sci-fi')).toEqual(['cosy']);
  });
});

describe('hasAllTags', () => {
  it('is AND and case-insensitive', () => {
    expect(hasAllTags(['Sci-Fi', 'cosy'], ['sci-fi'])).toBe(true);
    expect(hasAllTags(['Sci-Fi', 'cosy'], ['sci-fi', 'COSY'])).toBe(true);
    expect(hasAllTags(['Sci-Fi'], ['sci-fi', 'cosy'])).toBe(false);
  });
  it('matches everything when nothing is selected', () => {
    expect(hasAllTags([], [])).toBe(true);
  });
});

describe('countTags', () => {
  it('counts per tag and per section, most used first', () => {
    const counts = countTags([
      { tags: ['Cosy', 'reread'], section: 'books' },
      { tags: ['cosy'], section: 'anime' },
      { tags: ['COSY', 'cosy'], section: 'books' },
      { tags: ['abandoned'], section: 'games' },
    ]);
    expect(counts).toEqual([
      { tag: 'Cosy', count: 3, bySection: { books: 2, anime: 1 } },
      { tag: 'abandoned', count: 1, bySection: { games: 1 } },
      { tag: 'reread', count: 1, bySection: { books: 1 } },
    ]);
  });
});

describe('suggestTags', () => {
  it('suggests known tags containing the text, minus those already set', () => {
    expect(suggestTags(['Cosy', 'cozy mystery', 'Sci-Fi'], ['cosy'], 'co')).toEqual(['cozy mystery']);
    expect(suggestTags(['a', 'b', 'c'], [], '', 2)).toEqual(['a', 'b']);
  });
});
