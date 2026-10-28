import { describe, expect, it } from 'vitest';

import { isbn10to13, normalizeIsbn } from './isbn';

describe('normalizeIsbn', () => {
  it('accepts valid ISBN-13 and ISBN-10, with hyphens, spaces and a lower-case x', () => {
    expect(normalizeIsbn('978-0-441-17271-9')).toBe('9780441172719');
    expect(normalizeIsbn(' 9780441172719 ')).toBe('9780441172719');
    expect(normalizeIsbn('0-441-17271-7')).toBe('0441172717');
    expect(normalizeIsbn('0-8044-2957-x')).toBe('080442957X');
    expect(normalizeIsbn('979-10-90636-07-1')).toBe('9791090636071');
  });

  it('refuses wrong check digits, wrong lengths and non-book EANs', () => {
    expect(normalizeIsbn('9780441172718')).toBeNull();
    expect(normalizeIsbn('0441172718')).toBeNull();
    expect(normalizeIsbn('978044117271')).toBeNull();
    expect(normalizeIsbn('4006381333931')).toBeNull(); // a valid EAN-13, but not a book
    expect(normalizeIsbn('X441172717')).toBeNull();
    expect(normalizeIsbn('')).toBeNull();
  });
});

describe('isbn10to13', () => {
  it('converts with a fresh check digit', () => {
    expect(isbn10to13('0441172717')).toBe('9780441172719');
    expect(isbn10to13('080442957X')).toBe('9780804429573');
  });
});
