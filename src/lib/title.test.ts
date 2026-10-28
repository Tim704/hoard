import { describe, expect, it } from 'vitest';

import { displayTitle, matchesTitle, titleVariants } from './title';

const frieren = {
  title: 'Frieren: Beyond Journey’s End',
  titleEnglish: 'Frieren: Beyond Journey’s End',
  titleRomaji: 'Sousou no Frieren',
  titleNative: '葬送のフリーレン',
};

describe('displayTitle', () => {
  it('shows the preferred variant', () => {
    expect(displayTitle(frieren, 'english')).toBe('Frieren: Beyond Journey’s End');
    expect(displayTitle(frieren, 'romaji')).toBe('Sousou no Frieren');
    expect(displayTitle(frieren, 'native')).toBe('葬送のフリーレン');
  });

  it('defaults to english', () => {
    expect(displayTitle(frieren)).toBe('Frieren: Beyond Journey’s End');
  });

  it('falls back english → romaji → native → title', () => {
    const noEnglish = { title: 'Stored', titleEnglish: null, titleRomaji: 'Romaji', titleNative: 'ネイティブ' };
    expect(displayTitle(noEnglish, 'english')).toBe('Romaji');
    const onlyNative = { title: 'Stored', titleEnglish: '', titleRomaji: '  ', titleNative: 'ネイティブ' };
    expect(displayTitle(onlyNative, 'english')).toBe('ネイティブ');
    expect(displayTitle(onlyNative, 'romaji')).toBe('ネイティブ');
    const noRomaji = { title: 'Stored', titleEnglish: 'English', titleRomaji: null, titleNative: null };
    expect(displayTitle(noRomaji, 'romaji')).toBe('English');
    expect(displayTitle(noRomaji, 'native')).toBe('English');
  });

  it('returns the stored title when there are no variants (other media, old rows)', () => {
    expect(displayTitle({ title: 'Dune' }, 'native')).toBe('Dune');
    expect(displayTitle({ title: 'Old row', titleEnglish: null, titleRomaji: null, titleNative: null }, 'romaji')).toBe(
      'Old row',
    );
  });
});

describe('title matching', () => {
  it('lists distinct variants', () => {
    expect(titleVariants(frieren)).toEqual(['Frieren: Beyond Journey’s End', 'Sousou no Frieren', '葬送のフリーレン']);
  });

  it('matches any variant, case-insensitively', () => {
    expect(matchesTitle(frieren, 'sousou')).toBe(true);
    expect(matchesTitle(frieren, 'FRIEREN')).toBe(true);
    expect(matchesTitle(frieren, 'フリーレン')).toBe(true);
    expect(matchesTitle(frieren, 'naruto')).toBe(false);
    expect(matchesTitle({ title: 'Dune' }, '')).toBe(true);
  });
});
