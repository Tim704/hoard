import { describe, expect, it } from 'vitest';

import {
  completeLink,
  linkQueryAt,
  linkTargets,
  mentionsOf,
  parseNoteLinks,
  resolveNoteLink,
  type LinkCandidate,
} from './linked-notes';

const link = (target: string, label = target) => ({ kind: 'link', target, label });
const text = (t: string) => ({ kind: 'text', text: t });

describe('parseNoteLinks', () => {
  it('finds several links between text', () => {
    expect(parseNoteLinks('Like [[Dune]] meets [[Alien]].')).toEqual([
      text('Like '),
      link('Dune'),
      text(' meets '),
      link('Alien'),
      text('.'),
    ]);
    expect(parseNoteLinks('[[A]][[B]]')).toEqual([link('A'), link('B')]);
  });

  it('keeps balanced brackets inside a link', () => {
    expect(parseNoteLinks('see [[Persona 5 [Royal]]] now')).toEqual([text('see '), link('Persona 5 [Royal]'), text(' now')]);
    expect(parseNoteLinks('[[a [b] c]]')).toEqual([link('a [b] c')]);
  });

  it('treats unclosed and nested openers as text, the inner one may still link', () => {
    expect(parseNoteLinks('[[a [[b]] c')).toEqual([text('[[a '), link('b'), text(' c')]);
    expect(parseNoteLinks('open [[ only')).toEqual([text('open [[ only')]);
    expect(parseNoteLinks('[[]] and [[   ]]')).toEqual([text('[[]] and [[   ]]')]);
    expect(parseNoteLinks('[[across\nlines]]')).toEqual([text('[[across\nlines]]')]);
    expect(parseNoteLinks('[[x]')).toEqual([text('[[x]')]);
  });

  it('honours \\[[ as a literal and supports [[target|label]]', () => {
    expect(parseNoteLinks('literal \\[[Dune]] here')).toEqual([text('literal [[Dune]] here')]);
    expect(parseNoteLinks('[[Dune|the spice one]]')).toEqual([link('Dune', 'the spice one')]);
    expect(parseNoteLinks('[[Dune|]]')).toEqual([link('Dune', 'Dune')]);
    expect(parseNoteLinks('[[  Dune   Messiah ]]')).toEqual([link('Dune Messiah')]);
  });

  it('rejects overlong targets', () => {
    const long = 'x'.repeat(201);
    expect(parseNoteLinks(`[[${long}]]`)).toEqual([text(`[[${long}]]`)]);
  });

  it('lists distinct targets, ignoring case', () => {
    expect(linkTargets('[[Dune]] [[dune]] [[Alien|x]]')).toEqual(['Dune', 'Alien']);
    expect(linkTargets(null)).toEqual([]);
  });
});

const idx = (over: Partial<LinkCandidate> & { id: string; title: string }): LinkCandidate => ({
  category: 'movies',
  year: null,
  ...over,
});

// Newest update first, as getLibraryIndex returns it.
const index: LinkCandidate[] = [
  idx({ id: 'dune-film', title: 'Dune', category: 'movies', year: 2021 }),
  idx({ id: 'dune-book', title: 'Dune', category: 'books', year: 1965 }),
  idx({ id: 'dune-1984', title: 'Dune', category: 'movies', year: 1984 }),
  idx({ id: 'aot', title: 'Shingeki no Kyojin', titleEnglish: 'Attack on Titan', titleNative: '進撃の巨人', category: 'anime' }),
  idx({ id: 'poke', title: 'Pokémon Red', category: 'games' }),
];

describe('resolveNoteLink', () => {
  it('matches any title variant, ignoring case and spacing', () => {
    expect(resolveNoteLink('attack ON  titan', index)?.id).toBe('aot');
    expect(resolveNoteLink('進撃の巨人', index)?.id).toBe('aot');
    expect(resolveNoteLink('shingeki no kyojin', index)?.id).toBe('aot');
  });

  it('prefers the same section, then the most recently updated', () => {
    expect(resolveNoteLink('Dune', index, { category: 'books' })?.id).toBe('dune-book');
    expect(resolveNoteLink('Dune', index, { category: 'movies' })?.id).toBe('dune-film');
    expect(resolveNoteLink('Dune', index, { category: 'anime' })?.id).toBe('dune-film');
  });

  it('falls back to accent-free matching and a (year) suffix', () => {
    expect(resolveNoteLink('Pokemon Red', index)?.id).toBe('poke');
    expect(resolveNoteLink('Dune (1984)', index, { category: 'books' })?.id).toBe('dune-1984');
    expect(resolveNoteLink('Dune (1999)', index)).toBeNull();
  });

  it('never links a title to itself and leaves unknown titles unresolved', () => {
    expect(resolveNoteLink('Dune', index, { id: 'dune-film', category: 'movies' })?.id).toBe('dune-1984');
    expect(resolveNoteLink('Solaris', index)).toBeNull();
    expect(resolveNoteLink('   ', index)).toBeNull();
  });
});

describe('autocomplete helpers', () => {
  it('finds the [[ being typed', () => {
    expect(linkQueryAt('see [[Du', 8)).toEqual({ start: 4, query: 'Du' });
    expect(linkQueryAt('see [[', 6)).toEqual({ start: 4, query: '' });
    expect(linkQueryAt('see [[Dune]] x', 14)).toBeNull();
    expect(linkQueryAt('see \\[[Du', 9)).toBeNull();
    expect(linkQueryAt('[[a\nb', 5)).toBeNull();
    expect(linkQueryAt('no link', 7)).toBeNull();
  });

  it('completes the link and places the caret after it', () => {
    expect(completeLink('see [[Du rest', 4, 8, 'Dune')).toEqual({ text: 'see [[Dune]] rest', caret: 12 });
    expect(completeLink('see [[Du]] rest', 4, 8, 'Dune')).toEqual({ text: 'see [[Dune]] rest', caret: 12 });
    expect(completeLink('[[', 0, 2, 'Odd ]] title')).toEqual({ text: '[[Odd ] ] title]]', caret: 17 });
  });
});

describe('mentionsOf', () => {
  it('finds titles whose notes or reviews link to the target', () => {
    const sources = [
      { id: 'aot', category: 'anime', texts: ['Feels like [[Dune]]', null] },
      { id: 'poke', category: 'games', texts: [null, 'Nothing like [[dune (1984)]]'] },
      { id: 'dune-book', category: 'books', texts: ['The film: [[Dune]]'] },
      { id: 'dune-film', category: 'movies', texts: ['[[Dune]] is me'] },
    ];
    expect(mentionsOf('dune-film', sources, index)).toEqual(['aot', 'dune-book']);
    // The film's own "[[Dune]]" can't mean itself, so it reaches the 1984 film.
    expect(mentionsOf('dune-1984', sources, index)).toEqual(['poke', 'dune-film']);
  });
});
