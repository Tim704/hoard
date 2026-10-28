import { describe, expect, it } from 'vitest';

import { foldText, fuzzyScore, rankFuzzy } from './fuzzy';

describe('foldText', () => {
  it('lower-cases, strips accents and punctuation', () => {
    expect(foldText('  Pokémon: Let’s Go!  ')).toBe('pokemon let s go');
  });
});

describe('fuzzyScore', () => {
  it('ranks exact > prefix > word starts > substring > subsequence', () => {
    const exact = fuzzyScore('dune', 'Dune')!;
    const prefix = fuzzyScore('dune', 'Dune Messiah')!;
    const words = fuzzyScore('mess dun', 'Dune Messiah')!;
    const wordStartSub = fuzzyScore('messiah', 'Dune Messiah')!;
    const inner = fuzzyScore('une', 'Dune')!;
    const subseq = fuzzyScore('dnm', 'Dune Messiah')!;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(words);
    expect(words).toBeGreaterThanOrEqual(wordStartSub);
    expect(wordStartSub).toBeGreaterThan(inner);
    expect(inner).toBeGreaterThan(subseq);
    expect(subseq).toBeGreaterThan(0);
  });

  it('returns null for no match or an empty query', () => {
    expect(fuzzyScore('xyz', 'Dune')).toBeNull();
    expect(fuzzyScore('  ', 'Dune')).toBeNull();
  });
});

describe('rankFuzzy', () => {
  const titles = ['Fortune', 'The Unexpected', 'Dune', 'Underworld', 'Dune: Part Two', 'Blue Eye Samurai'];

  it('puts word-start matches first', () => {
    const ranked = rankFuzzy(titles, 'un', (t) => [t]);
    expect(ranked.slice(0, 2).sort()).toEqual(['The Unexpected', 'Underworld']);
    expect(ranked).toContain('Dune');
    expect(ranked).toContain('Fortune');
  });

  it('uses the best of several title variants and breaks ties by length', () => {
    const items = [
      { id: 1, names: ['Shingeki no Kyojin', 'Attack on Titan'] },
      { id: 2, names: ['Attack on Titan Final Season'] },
      { id: 3, names: ['Titanic'] },
    ];
    expect(rankFuzzy(items, 'attack', (i) => i.names).map((i) => i.id)).toEqual([1, 2]);
    expect(rankFuzzy(items, 'kyojin', (i) => i.names).map((i) => i.id)).toEqual([1]);
    expect(rankFuzzy(items, 'titan', (i) => i.names)[0].id).toBe(3);
  });

  it('caps the list', () => {
    expect(rankFuzzy(titles, 'e', (t) => [t], 2)).toHaveLength(2);
  });
});
