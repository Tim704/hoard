import { describe, expect, it } from 'vitest';

import { cleanPlatforms, formatOptions, matchesOwnership, ownershipChoices, ownershipText, validFormat } from './ownership';

describe('ownership and format', () => {
  it('offers formats per section', () => {
    expect(formatOptions('books')).toEqual(['print', 'ebook', 'audio']);
    expect(formatOptions('manga')).toEqual(['print', 'ebook', 'audio']);
    expect(formatOptions('music')).toEqual(['vinyl', 'cd', 'digital']);
    expect(formatOptions('movies')).toEqual([]);
    expect(validFormat('music', 'vinyl')).toBe(true);
    expect(validFormat('music', 'ebook')).toBe(false);
    expect(validFormat('books', null)).toBe(true);
    expect(validFormat('games', 'print')).toBe(false);
  });

  it('cleans owned platforms', () => {
    expect(cleanPlatforms(['  PC ', 'pc', 'Nintendo   Switch', '', 3, 'x'.repeat(61)])).toEqual(['PC', 'Nintendo Switch']);
    expect(cleanPlatforms('PC')).toEqual([]);
    expect(cleanPlatforms(Array.from({ length: 30 }, (_, i) => `P${i}`))).toHaveLength(20);
  });

  it('shows and filters', () => {
    const game = { category: 'games' as const, ownedPlatforms: ['PC', 'Switch'], format: null };
    const book = { category: 'books' as const, ownedPlatforms: [], format: 'audio' };
    expect(ownershipText(game)).toBe('PC, Switch');
    expect(ownershipText(book)).toBe('Audiobook');
    expect(ownershipText({ ...book, format: null })).toBeNull();
    expect(matchesOwnership(game, 'ALL')).toBe(true);
    expect(matchesOwnership(game, 'switch')).toBe(true);
    expect(matchesOwnership(game, 'NONE')).toBe(false);
    expect(matchesOwnership(book, 'audio')).toBe(true);
    expect(matchesOwnership(book, 'print')).toBe(false);
    expect(matchesOwnership({ ...book, format: null }, 'NONE')).toBe(true);
    expect(ownershipChoices('games', [game, { ownedPlatforms: ['pc', 'PS5'] }]).map((c) => c.value)).toEqual(['PC', 'PS5', 'Switch']);
  });
});
