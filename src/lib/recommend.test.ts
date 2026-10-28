import { describe, expect, it } from 'vitest';

import {
  buildRecommendPrompt,
  filterRecommendations,
  inLibrary,
  normalizeForMatch,
  parseRecommendAnswer,
  pickSeeds,
  RECOMMEND_MALFORMED,
  type LibraryTitle,
  type Recommendation,
  type RecommendSeed,
} from './recommend';

const seed = (title: string, over: Partial<RecommendSeed> = {}): RecommendSeed => ({
  category: 'movies',
  title,
  year: null,
  tier: 'A',
  rating: null,
  ...over,
});

const rec = (title: string, category: Recommendation['category'], year: number | null = null): Recommendation => ({
  category,
  title,
  year,
  because: 'You loved something like it.',
});

describe('buildRecommendPrompt', () => {
  it('gives the S/A titles as "do not recommend" context, with the profile and allowed sections', () => {
    const prompt = buildRecommendPrompt({
      seeds: [seed('Heat', { year: 1995, tier: 'S' }), seed('Frieren', { category: 'anime', year: 2023 })],
      profileLines: ['Their taste profile (scores on a 0–10 scale):', '- You love Drama.'],
      sections: ['movies', 'anime', 'books'],
    });
    expect(prompt).toContain('- [movies] Heat (1995) — tier S');
    expect(prompt).toContain('- [anime] Frieren (2023) — tier A');
    expect(prompt).toMatch(/Do NOT recommend anything in the list below/);
    expect(prompt).toContain('- You love Drama.');
    expect(prompt).toContain('movies (Movies), anime (Anime), books (Books)');
    expect(prompt).not.toContain('games (');
  });

  it('caps the context at 60, S tier first', () => {
    const seeds = [
      ...Array.from({ length: 70 }, (_, i) => seed(`A title ${i}`, { rating: i % 10 })),
      seed('The S one', { tier: 'S' }),
    ];
    const picked = pickSeeds(seeds);
    expect(picked).toHaveLength(60);
    expect(picked[0].title).toBe('The S one');
    const prompt = buildRecommendPrompt({ seeds, profileLines: [], sections: ['movies'] });
    expect(prompt.match(/^- \[movies\]/gm)).toHaveLength(60);
  });

  it('still asks without any ranked titles', () => {
    expect(buildRecommendPrompt({ seeds: [], profileLines: [], sections: ['books'] })).toContain('(none ranked yet)');
  });
});

describe('parseRecommendAnswer', () => {
  const sections = ['movies', 'books', 'anime'] as const;

  it('reads a list, dropping invalid items and categories', () => {
    const answer = JSON.stringify([
      { category: 'books', title: 'Piranesi', year: 2020, because: 'Dreamy and strange.' },
      { category: 'games', title: 'Outer Wilds', because: 'Hidden section.' },
      { category: 'podcasts', title: 'Nope', because: 'Not a section.' },
      { category: 'movies', title: '', because: 'No title.' },
      { category: 'movies', title: 'Arrival', because: '' },
      { category: 'anime', title: 'Mushishi', year: 'soon', because: 'Bad year.' },
      { category: 'anime', title: 'Mushishi', because: 'Quiet wonder.' },
    ]);
    const res = parseRecommendAnswer(answer, sections);
    expect(res).toEqual({
      ok: true,
      items: [
        { category: 'books', title: 'Piranesi', year: 2020, because: 'Dreamy and strange.' },
        { category: 'anime', title: 'Mushishi', year: null, because: 'Quiet wonder.' },
      ],
    });
  });

  it('accepts a fence or an {items} wrapper', () => {
    const inner = [{ category: 'movies', title: 'Arrival', because: 'Yes.' }];
    expect(parseRecommendAnswer('```json\n' + JSON.stringify(inner) + '\n```', sections).ok).toBe(true);
    expect(parseRecommendAnswer(JSON.stringify({ items: inner }), sections)).toMatchObject({ ok: true, items: [{ title: 'Arrival' }] });
  });

  it('is a friendly error for broken answers', () => {
    expect(parseRecommendAnswer('not json', sections)).toEqual({ ok: false, error: RECOMMEND_MALFORMED });
    expect(parseRecommendAnswer('{"a":1}', sections)).toEqual({ ok: false, error: RECOMMEND_MALFORMED });
    expect(parseRecommendAnswer(undefined, sections)).toEqual({ ok: false, error: RECOMMEND_MALFORMED });
  });
});

describe('library filter', () => {
  const library: LibraryTitle[] = [
    { category: 'movies', title: 'The Thing', year: 1982 },
    { category: 'anime', title: 'Sen to Chihiro no Kamikakushi', titleEnglish: 'Spirited Away', year: 2001 },
    { category: 'books', title: 'Dune', year: 1965 },
    { category: 'games', title: 'Pokémon Red', year: null },
  ];

  it('normalises accents, case, punctuation and a leading article', () => {
    expect(normalizeForMatch('  The Lord of the Rings: The Return of the King ')).toBe('lord of the rings the return of the king');
    expect(normalizeForMatch('Pokémon RED!')).toBe('pokemon red');
    expect(normalizeForMatch('Fast & Furious')).toBe('fast and furious');
  });

  it('matches any title variant, by year when both are known, within a match group', () => {
    expect(inLibrary(rec('Thing', 'movies', 1982), library)).toBe(true);
    // The 2011 prequel is a different film.
    expect(inLibrary(rec('The Thing', 'movies', 2011), library)).toBe(false);
    // An anime film recommended as a movie is still the same film.
    expect(inLibrary(rec('Spirited Away', 'movies', 2001), library)).toBe(true);
    // Dune the film is not Dune the book.
    expect(inLibrary(rec('Dune', 'movies', 2021), library)).toBe(false);
    expect(inLibrary(rec('Dune', 'books', null), library)).toBe(true);
    expect(inLibrary(rec('pokemon red', 'games', 1996), library)).toBe(true);
  });

  it('drops owned titles and repeats, keeps at most 6 from at least 3 sections', () => {
    const items = [
      rec('Spirited Away', 'anime'),
      rec('Arrival', 'movies'),
      rec('Heat', 'movies'),
      rec('Arrival', 'movies'),
      rec('Prisoners', 'movies'),
      rec('Zodiac', 'movies'),
      rec('Sicario', 'movies'),
      rec('Memento', 'movies'),
      rec('Piranesi', 'books'),
      rec('Mushishi', 'anime'),
    ];
    const out = filterRecommendations(items, library);
    expect(out).toHaveLength(6);
    expect(out.map((r) => r.title)).toEqual(['Arrival', 'Heat', 'Prisoners', 'Zodiac', 'Piranesi', 'Mushishi']);
    expect(new Set(out.map((r) => r.category)).size).toBe(3);
  });

  it('keeps what is valid when the answer has fewer sections, inventing nothing', () => {
    const out = filterRecommendations([rec('Arrival', 'movies'), rec('Heat', 'movies'), rec('Dune', 'books')], library);
    expect(out.map((r) => r.title)).toEqual(['Arrival', 'Heat']);
  });
});
