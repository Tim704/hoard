import { describe, expect, it } from 'vitest';

import { genreForSubject, genresFromSubjects, genresFromTags, normalizeGenres } from './genres';

describe('genresFromSubjects (OpenLibrary)', () => {
  it('maps the real Dune subjects to at most 3 allow-listed genres', () => {
    // From a live https://openlibrary.org/works/OL893414W.json response.
    const subjects = [
      'Dune (Imaginary place)',
      'Fiction',
      'Fiction, science fiction, general',
      'Dune (imaginary place), fiction',
      'New York Times reviewed',
      'Science fiction',
      'Science-fiction',
      'American literature',
      'nyt:mass-market-monthly=2021-11-07',
      'award:hugo_award=novel',
      'Ecology',
      'Fantasy fiction',
      'Large type books',
    ];
    expect(genresFromSubjects(subjects)).toEqual(['Science Fiction', 'Fantasy']);
  });

  it('caps at three and keeps subject order', () => {
    expect(
      genresFromSubjects(['Horror tales', 'Romance fiction', 'Detective and mystery stories', 'Thrillers']),
    ).toEqual(['Horror', 'Romance', 'Mystery']);
  });

  it('only matches whole words and exact-only rules', () => {
    expect(genreForSubject('English literature, history and criticism')).toBeNull();
    expect(genreForSubject('History')).toBe('History');
    expect(genreForSubject('Fiction')).toBeNull();
    expect(genreForSubject("Children's fiction")).toBe("Children's");
    expect(genreForSubject('Juvenile fiction')).toBe("Children's");
    expect(genreForSubject('True crime')).toBe('True Crime');
    expect(genreForSubject('Crime')).toBe('Crime');
  });

  it('survives junk input', () => {
    expect(genresFromSubjects(undefined)).toEqual([]);
    expect(genresFromSubjects([null, 3, ''])).toEqual([]);
  });
});

describe('genresFromTags (Last.fm)', () => {
  it('drops junk tags and title-cases the rest', () => {
    const tags = [{ name: 'seen live' }, { name: 'indie rock' }, { name: '2012' }, { name: 'hip-hop' }, { name: 'Indie Rock' }, { name: 'pop' }, { name: 'rock' }];
    expect(genresFromTags(tags)).toEqual(['Indie Rock', 'Hip-Hop', 'Pop']);
  });

  it('accepts plain strings and bad input', () => {
    expect(genresFromTags(['electronic'])).toEqual(['Electronic']);
    expect(genresFromTags(null)).toEqual([]);
  });
});

describe('normalizeGenres', () => {
  it('trims, de-duplicates and caps', () => {
    expect(normalizeGenres([' Action ', 'action', 'Drama', '', 'Fantasy'], 2)).toEqual(['Action', 'Drama']);
  });
});
