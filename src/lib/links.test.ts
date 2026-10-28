import { describe, expect, it } from 'vitest';

import { findUrl, isbnFromHtml, letterboxdQuery, pageTitle, parseMediaUrl, sharedInput, slugWords } from './links';

describe('parseMediaUrl', () => {
  it('reads TMDB movie and tv links', () => {
    expect(parseMediaUrl('https://www.themoviedb.org/movie/603-the-matrix')).toEqual({ provider: 'tmdb', id: '603', category: 'movies' });
    expect(parseMediaUrl('https://www.themoviedb.org/tv/1396')).toEqual({ provider: 'tmdb', id: '1396', category: 'tv' });
    expect(parseMediaUrl('https://themoviedb.org/tv/1396-breaking-bad/season/1?language=de')).toEqual({ provider: 'tmdb', id: '1396', category: 'tv' });
    expect(parseMediaUrl('https://www.themoviedb.org/person/287')).toBeNull();
  });

  it('reads IMDb title links on www and m., with trailing paths and queries', () => {
    const want = { provider: 'imdb', id: 'tt0133093' };
    expect(parseMediaUrl('https://www.imdb.com/title/tt0133093/')).toEqual(want);
    expect(parseMediaUrl('https://m.imdb.com/title/tt0133093/?ref_=nv_sr_1')).toEqual(want);
    expect(parseMediaUrl('https://www.imdb.com/title/tt0133093/reviews?ref_=tt_urv')).toEqual(want);
    expect(parseMediaUrl('https://imdb.com/de/title/TT0133093')).toEqual(want);
    expect(parseMediaUrl('https://www.imdb.com/name/nm0000206/')).toBeNull();
  });

  it('reads AniList and MyAnimeList anime and manga links', () => {
    expect(parseMediaUrl('https://anilist.co/anime/1/Cowboy-Bebop/')).toEqual({ provider: 'anilist', id: '1', category: 'anime' });
    expect(parseMediaUrl('https://anilist.co/anime/1')).toEqual({ provider: 'anilist', id: '1', category: 'anime' });
    expect(parseMediaUrl('https://anilist.co/manga/30013/One-Piece')).toEqual({ provider: 'anilist', id: '30013', category: 'manga' });
    expect(parseMediaUrl('https://myanimelist.net/anime/1/Cowboy_Bebop')).toEqual({ provider: 'mal', id: '1', category: 'anime' });
    expect(parseMediaUrl('https://myanimelist.net/manga/13/One_Piece?q=x')).toEqual({ provider: 'mal', id: '13', category: 'manga' });
    expect(parseMediaUrl('https://anilist.co/user/someone')).toBeNull();
  });

  it('reads IGDB and Steam game links', () => {
    expect(parseMediaUrl('https://www.igdb.com/games/the-witcher-3-wild-hunt')).toEqual({
      provider: 'igdb',
      id: 'the-witcher-3-wild-hunt',
      category: 'games',
      hint: 'the witcher 3 wild hunt',
    });
    expect(parseMediaUrl('https://store.steampowered.com/app/570/Dota_2/')).toEqual({
      provider: 'steam',
      id: '570',
      category: 'games',
      hint: 'Dota 2',
    });
    expect(parseMediaUrl('https://store.steampowered.com/app/292030')).toEqual({ provider: 'steam', id: '292030', category: 'games' });
    expect(parseMediaUrl('https://store.steampowered.com/bundle/232')).toBeNull();
  });

  it('reads Goodreads book links with dash and dot slugs', () => {
    expect(parseMediaUrl('https://www.goodreads.com/book/show/44767458-dune')).toEqual({
      provider: 'goodreads',
      id: '44767458',
      category: 'books',
      hint: 'dune',
    });
    expect(parseMediaUrl('https://www.goodreads.com/book/show/234225.Dune')).toEqual({
      provider: 'goodreads',
      id: '234225',
      category: 'books',
      hint: 'Dune',
    });
    expect(parseMediaUrl('https://www.goodreads.com/en/book/show/12345')).toEqual({ provider: 'goodreads', id: '12345', category: 'books' });
    expect(parseMediaUrl('https://www.goodreads.com/author/show/58.Frank_Herbert')).toBeNull();
  });

  it('reads Letterboxd film links and leaves boxd.it short links unknown', () => {
    expect(parseMediaUrl('https://letterboxd.com/film/the-matrix/')).toEqual({
      provider: 'letterboxd',
      id: 'the-matrix',
      category: 'movies',
      hint: 'the matrix',
    });
    expect(parseMediaUrl('https://letterboxd.com/someone/film/dune-2021/reviews/')).toMatchObject({ id: 'dune-2021', hint: 'dune' });
    expect(parseMediaUrl('https://boxd.it/2a1o')).toBeNull();
  });

  it('reads OpenLibrary work and edition links', () => {
    expect(parseMediaUrl('https://openlibrary.org/works/OL893414W/Dune')).toEqual({ provider: 'openlibrary', id: '/works/OL893414W', category: 'books' });
    expect(parseMediaUrl('https://openlibrary.org/books/OL22597282M/Dune')).toEqual({ provider: 'openlibrary', id: '/books/OL22597282M', category: 'books' });
    expect(parseMediaUrl('https://openlibrary.org/authors/OL79034A')).toBeNull();
  });

  it('refuses junk and other schemes', () => {
    expect(parseMediaUrl('not a url')).toBeNull();
    expect(parseMediaUrl('javascript:alert(1)')).toBeNull();
    expect(parseMediaUrl('ftp://anilist.co/anime/1')).toBeNull();
    expect(parseMediaUrl('https://example.com/movie/603')).toBeNull();
  });
});

describe('findUrl and sharedInput', () => {
  it('finds a link among words and trims trailing punctuation', () => {
    expect(findUrl('Check this out https://anilist.co/anime/1/Cowboy-Bebop/ so good!')).toBe('https://anilist.co/anime/1/Cowboy-Bebop/');
    expect(findUrl('(see https://www.imdb.com/title/tt0133093).')).toBe('https://www.imdb.com/title/tt0133093');
    expect(findUrl('https://en.wikipedia.org/wiki/Dune_(novel)')).toBe('https://en.wikipedia.org/wiki/Dune_(novel)');
    expect(findUrl('no link here')).toBeNull();
  });

  it('takes the link from url or text, and the guess from title, text or slug', () => {
    expect(sharedInput({ text: 'Watch this https://letterboxd.com/film/the-matrix/' })).toEqual({
      url: 'https://letterboxd.com/film/the-matrix/',
      guess: 'Watch this',
    });
    expect(sharedInput({ url: 'https://letterboxd.com/film/the-matrix/' })).toEqual({
      url: 'https://letterboxd.com/film/the-matrix/',
      guess: 'the matrix',
    });
    expect(sharedInput({ title: 'Dune', text: 'Have you read this?', url: 'https://example.com/dune' })).toEqual({
      url: 'https://example.com/dune',
      guess: 'Dune',
    });
    expect(sharedInput({ text: 'Frieren' })).toEqual({ url: null, guess: 'Frieren' });
  });
});

describe('slug helpers', () => {
  it('turns slugs into words and splits a Letterboxd year', () => {
    expect(slugWords('the-matrix_reloaded')).toBe('the matrix reloaded');
    expect(slugWords('caf%C3%A9-society')).toBe('café society');
    expect(letterboxdQuery('dune-2021')).toEqual({ query: 'dune', year: 2021 });
    expect(letterboxdQuery('the-matrix')).toEqual({ query: 'the matrix' });
    expect(letterboxdQuery('2001-a-space-odyssey')).toEqual({ query: '2001 a space odyssey' });
    expect(letterboxdQuery('1917')).toEqual({ query: '1917' });
  });
});

describe('page parsing', () => {
  it('reads og:title, else <title>, dropping a site suffix', () => {
    expect(pageTitle('<head><meta property="og:title" content="Dune &amp; Sons"><title>x</title></head>')).toBe('Dune & Sons');
    expect(pageTitle('<title>\n The Matrix (1999) - IMDb </title>')).toBe('The Matrix (1999)');
    expect(pageTitle('<title>Dune by Frank Herbert | Goodreads</title>')).toBe('Dune by Frank Herbert');
    expect(pageTitle('<title>Spider-Man</title>')).toBe('Spider-Man');
    expect(pageTitle('<p>nothing</p>')).toBeNull();
  });

  it('never throws on huge, zero or surrogate numeric entities', () => {
    expect(pageTitle('<title>A &#99999999; B</title>')).toBe('A \uFFFD B');
    expect(pageTitle('<title>&#xD800;x&#0;&#x110000;</title>')).toBe('\uFFFDx\uFFFD\uFFFD');
    expect(pageTitle('<title>&#99999999999999999999;</title>')).toBe('&#99999999999999999999;');
    expect(pageTitle('<title>caf&#xE9; &#233;</title>')).toBe('café é');
  });

  it('finds an ISBN in meta tags or page JSON', () => {
    expect(isbnFromHtml('<meta content="9780441172719" property="books:isbn">')).toBe('9780441172719');
    expect(isbnFromHtml('<script>{"@type":"Book","isbn":"0441172717"}</script>')).toBe('0441172717');
    expect(isbnFromHtml('{"isbn13":"978-0-441-17271-9","isbn":null}')).toBe('9780441172719');
    expect(isbnFromHtml('{"isbn":"null"}')).toBeNull();
  });
});
