import { describe, expect, it } from 'vitest';

import { clickNonce, openRedirect, titleHref, titlePageOutcome, universalTitleHref } from './title-href';

describe('titleHref', () => {
  it('popup: the section page with ?open=', () => {
    expect(titleHref('books', 'abc', 'popup')).toBe('/books?open=abc');
  });
  it('popup: a nonce makes each click a new link', () => {
    expect(titleHref('tv', 'abc', 'popup', { nonce: 'k3x' })).toBe('/tv?open=abc&t=k3x');
  });
  it('page: the title page, never a nonce', () => {
    expect(titleHref('books', 'abc', 'page')).toBe('/books/title/abc');
    expect(titleHref('books', 'abc', 'page', { nonce: 'k3x' })).toBe('/books/title/abc');
  });
  it('encodes the id (and the nonce)', () => {
    expect(titleHref('movies', 'a b/c?d', 'popup', { nonce: 'x&y' })).toBe('/movies?open=a%20b%2Fc%3Fd&t=x%26y');
    expect(titleHref('movies', 'a b/c?d', 'page')).toBe('/movies/title/a%20b%2Fc%3Fd');
  });
});

describe('universalTitleHref', () => {
  it('is the ?open= link whatever the view (stored in notifications, iCal and jobs)', () => {
    expect(universalTitleHref('tv', 'demo-activity-tv-expanse')).toBe('/tv?open=demo-activity-tv-expanse');
  });
});

describe('clickNonce', () => {
  it('is base 36 of the time', () => {
    expect(clickNonce(36 * 36)).toBe('100');
  });
});

describe('titlePageOutcome', () => {
  it('shows the title in its own section', () => {
    expect(titlePageOutcome('books', { id: 'a', category: 'books' })).toEqual({ kind: 'show' });
  });
  it('moves a title asked for under the wrong section to its own', () => {
    expect(titlePageOutcome('tv', { id: 'a', category: 'books' })).toEqual({ kind: 'redirect', href: '/books/title/a' });
    expect(titlePageOutcome('no-such-section', { id: 'a', category: 'games' })).toEqual({ kind: 'redirect', href: '/games/title/a' });
  });
  it('404s an unknown or someone else’s title', () => {
    expect(titlePageOutcome('books', null)).toEqual({ kind: 'not-found' });
  });
});

describe('openRedirect', () => {
  const found = { id: 'a', category: 'books' };
  it('page mode: the title page, in the title’s own section', () => {
    expect(openRedirect('page', found)).toBe('/books/title/a');
    expect(openRedirect('page', { id: 'a', category: 'tv' })).toBe('/tv/title/a');
  });
  it('popup mode stays (the popup opens)', () => {
    expect(openRedirect('popup', found)).toBeNull();
  });
  it('an unknown title stays (nothing opens, as in popup mode)', () => {
    expect(openRedirect('page', null)).toBeNull();
  });
});
