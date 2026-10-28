import { describe, expect, it } from 'vitest';

import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import { statTitle } from './fixtures';
import {
  computeTasteProfile,
  listWords,
  sameJson,
  parseTasteProfile,
  tastePromptLines,
  tasteSentences,
  type TasteProfile,
  withoutHidden,
} from './profile';

const labels = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])) as Record<CategorySlug, string>;

describe('computeTasteProfile', () => {
  it('is empty but valid for no titles', () => {
    const p = computeTasteProfile([]);
    expect(p).toEqual({ v: 1, finished: 0, genres: [], genreScores: [], sections: [], eras: [], top: [] });
    expect(parseTasteProfile(p)).toEqual(p);
    expect(tasteSentences(p)).toEqual([]);
    expect(tastePromptLines(p, labels)).toEqual([]);
  });

  it('lists only shown tiers among the top titles (a hidden tier on an ongoing title is left out)', () => {
    const p = computeTasteProfile([
      statTitle({ category: 'movies', status: 'COMPLETED', tier: 'A', media: { title: 'Shown' } }),
      statTitle({ category: 'movies', status: 'CONSUMING', tier: 'S', media: { title: 'Hidden' } }),
    ]);
    expect(p.top).toEqual([{ slug: 'movies', titles: ['Shown'] }]);
  });

  it('weights genres by count and score, finished titles only, top 10', () => {
    const rows = [
      statTitle({ rating: 9, media: { genres: ['Sports', 'Drama'] } }),
      statTitle({ rating: 10, media: { genres: ['sports '] } }),
      statTitle({ rating: null, media: { genres: ['Drama'] } }),
      statTitle({ rating: 2, media: { genres: ['Horror'] } }),
      statTitle({ rating: 3, media: { genres: ['Horror'] } }),
      // Not finished: ignored for genres.
      statTitle({ status: 'PLANNED', rating: 10, media: { genres: ['Horror', 'Western'] } }),
      statTitle({ status: 'DROPPED', rating: 1, media: { genres: ['Western'] } }),
      ...Array.from({ length: 12 }, (_, i) => statTitle({ rating: 1, media: { genres: [`G${String(i).padStart(2, '0')}`] } })),
    ];
    const p = computeTasteProfile(rows);
    expect(p.genres[0]).toEqual({ genre: 'Sports', count: 2, weight: 1.9 });
    expect(p.genres[1]).toEqual({ genre: 'Drama', count: 2, weight: 1.4 });
    expect(p.genres[2]).toEqual({ genre: 'Horror', count: 2, weight: 0.5 });
    expect(p.genres).toHaveLength(10);
    expect(p.genres.map((g) => g.genre)).not.toContain('Western');
  });

  it('averages a genre only with at least 3 rated titles', () => {
    const rows = [
      ...[8, 9, 7].map((r) => statTitle({ rating: r, media: { genres: ['Mystery'] } })),
      ...[5, 6].map((r) => statTitle({ rating: r, media: { genres: ['Romance'] } })),
      ...[4, 5, 6].map((r) => statTitle({ rating: r, media: { genres: ['Horror'] } })),
    ];
    const p = computeTasteProfile(rows);
    expect(p.genreScores).toEqual([
      { genre: 'Mystery', avgScore: 8, count: 3 },
      { genre: 'Horror', avgScore: 5, count: 3 },
    ]);
  });

  it('gives per-section averages (min 3 rated) and drop rates', () => {
    const rows = [
      ...[8, 9, 10].map((r) => statTitle({ category: 'anime', rating: r })),
      ...[7, 8, 9].map((r) => statTitle({ category: 'movies', rating: r })),
      statTitle({ category: 'tv', status: 'DROPPED', rating: 3 }),
      statTitle({ category: 'tv', status: 'DROPPED' }),
      statTitle({ category: 'tv', status: 'COMPLETED', rating: 8 }),
      statTitle({ category: 'tv', status: 'PLANNED' }),
    ];
    const p = computeTasteProfile(rows);
    const by = Object.fromEntries(p.sections.map((s) => [s.slug, s]));
    expect(p.sections.map((s) => s.slug)).toEqual(['movies', 'anime', 'tv']);
    expect(by.anime).toMatchObject({ avgScore: 9, rated: 3, dropRate: 0, ended: 3 });
    expect(by.movies.avgScore).toBe(8);
    expect(by.tv).toMatchObject({ titles: 4, finished: 1, rated: 2, avgScore: null, dropped: 2, ended: 3, dropRate: 0.67 });
    expect(p.finished).toBe(7);
  });

  it('picks the top 3 decades of finished titles by release year', () => {
    const years = [1994, 1997, 1999, 2004, 2011, 2015, 2018, 1985, 1972, null];
    const rows = years.map((y) => statTitle({ media: { year: y } }));
    rows.push(statTitle({ status: 'PLANNED', media: { year: 1975 } }), statTitle({ status: 'PLANNED', media: { year: 1976 } }));
    const p = computeTasteProfile(rows);
    // 1990s ×3, 2010s ×3 (ties: the later decade first), then the 2000s/1980s/1970s tie → 2000s.
    expect(p.eras).toEqual([
      { decade: 2010, count: 3 },
      { decade: 1990, count: 3 },
      { decade: 2000, count: 1 },
    ]);
  });

  it('lists the top S/A titles per section, S first, at most 5', () => {
    const rows = [
      statTitle({ category: 'movies', tier: 'A', rating: 10, media: { title: 'Alpha' } }),
      statTitle({ category: 'movies', tier: 'S', rating: 8, media: { title: 'Sigma' } }),
      statTitle({ category: 'movies', tier: 'B', rating: 10, media: { title: 'Beta' } }),
      ...Array.from({ length: 6 }, (_, i) => statTitle({ category: 'anime', tier: 'S', rating: i, media: { title: `Anime ${i}` } })),
    ];
    const p = computeTasteProfile(rows);
    expect(p.top).toEqual([
      { slug: 'movies', titles: ['Sigma', 'Alpha'] },
      { slug: 'anime', titles: ['Anime 5', 'Anime 4', 'Anime 3', 'Anime 2', 'Anime 1'] },
    ]);
  });
});

describe('tasteSentences', () => {
  const profile: TasteProfile = {
    v: 1,
    finished: 20,
    genres: [
      { genre: 'Sports', count: 5, weight: 4.5 },
      { genre: 'Drama', count: 4, weight: 3 },
    ],
    genreScores: [
      { genre: 'Sports', avgScore: 8.6, count: 5 },
      { genre: 'Horror', avgScore: 5.2, count: 3 },
    ],
    sections: [
      { slug: 'movies', titles: 6, finished: 6, rated: 6, avgScore: 7.1, dropped: 0, ended: 6, dropRate: 0 },
      { slug: 'tv', titles: 10, finished: 7, rated: 2, avgScore: null, dropped: 3, ended: 10, dropRate: 0.3 },
      { slug: 'anime', titles: 5, finished: 5, rated: 5, avgScore: 7.9, dropped: 0, ended: 5, dropRate: 0 },
    ],
    eras: [
      { decade: 2010, count: 8 },
      { decade: 1990, count: 4 },
    ],
    top: [{ slug: 'anime', titles: ['Haikyu!!'] }],
  };

  it('words the profile for people', () => {
    expect(tasteSentences(profile)).toEqual([
      'You love Sports and Drama.',
      'You rate anime 0.8 higher than films.',
      'You drop 30% of TV you start.',
      'Your best-rated genre is Sports (8.6); your lowest is Horror (5.2).',
      'Your favourite eras are the 2010s and 1990s.',
    ]);
  });

  it('uses the score format', () => {
    const s = tasteSentences(profile, 'hundred');
    expect(s[1]).toBe('You rate anime 8 higher than films.');
    expect(s[3]).toBe('Your best-rated genre is Sports (86); your lowest is Horror (52).');
  });

  it('feeds the AI the summary and favourites, not rows', () => {
    const lines = tastePromptLines(profile, labels);
    expect(lines[0]).toMatch(/0–10/);
    expect(lines).toContain('- You love Sports and Drama.');
    expect(lines[lines.length - 1]).toBe('- Favourites: Anime: Haikyu!!.');
    expect(tastePromptLines(profile, labels, { withFavourites: false }).join('\n')).not.toMatch(/Haikyu/);
    expect(tastePromptLines(null, labels)).toEqual([]);
  });

  it('says so when nothing is dropped', () => {
    const calm = { ...profile, sections: profile.sections.map((s) => ({ ...s, dropped: 0, dropRate: 0 })) };
    expect(tasteSentences(calm)).toContain('You finish what you start: no drops yet.');
  });
});

describe('parseTasteProfile', () => {
  it('rejects other versions and junk', () => {
    expect(parseTasteProfile(null)).toBeNull();
    expect(parseTasteProfile({ v: 2 })).toBeNull();
    expect(parseTasteProfile({ ...computeTasteProfile([]), sections: [{ slug: 'nope' }] })).toBeNull();
  });
});

describe('sameJson (the job skips an unchanged profile)', () => {
  it('compares deeply, ignoring key order', () => {
    const rows = [statTitle({ rating: 8, media: { genres: ['Drama'], year: 1999 } })];
    const a = computeTasteProfile(rows);
    // Stored JSON comes back with its keys in another order.
    const stored = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a).reverse())));
    expect(sameJson(computeTasteProfile(rows), stored)).toBe(true);
    expect(sameJson(computeTasteProfile([...rows, statTitle({ rating: 2 })]), stored)).toBe(false);
    expect(sameJson({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(true);
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJson(null, {})).toBe(false);
  });
});

describe('withoutHidden', () => {
  it('drops hidden sections from the averages, drop rates and favourites', () => {
    const rows = [
      ...[9, 9, 9].map((r) => statTitle({ category: 'anime', rating: r, tier: 'S', media: { title: `Anime ${r}` } })),
      ...[5, 5, 5].map((r) => statTitle({ category: 'movies', rating: r })),
      statTitle({ category: 'tv', status: 'DROPPED' }),
      ...[1, 2].map(() => statTitle({ category: 'tv' })),
    ];
    const p = computeTasteProfile(rows);
    expect(tasteSentences(p).join(' ')).toMatch(/anime/);
    const shown = withoutHidden(p, ['anime', 'tv']);
    expect(shown.sections.map((s) => s.slug)).toEqual(['movies']);
    expect(shown.top).toEqual([]);
    const words = [...tasteSentences(shown), ...tastePromptLines(shown, labels)].join(' ');
    expect(words).not.toMatch(/anime|TV/);
    expect(withoutHidden(p, [])).toBe(p);
  });
});

describe('listWords', () => {
  it('joins with commas and "and"', () => {
    expect(listWords([])).toBe('');
    expect(listWords(['a'])).toBe('a');
    expect(listWords(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
