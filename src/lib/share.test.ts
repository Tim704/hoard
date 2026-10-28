import { describe, expect, it } from 'vitest';

import {
  canManageShare,
  encodeShareToken,
  isShareTokenShape,
  isValidShareTarget,
  newShareToken,
  publicShare,
  reusableShare,
  sharePath,
  tierPngFileName,
  yearPngFileName,
  type ShareLinkRow,
} from './share';

const link = (over: Partial<ShareLinkRow & { createdAt: Date }> = {}) => ({
  id: 'tok_abcdefghijklmnopqrst',
  userId: 'u1',
  kind: 'tiers',
  target: 'books',
  revokedAt: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  ...over,
});

describe('share tokens', () => {
  it('are 24 base64url characters (144 bits) and differ every time', () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(a).not.toBe(b);
    expect(isShareTokenShape(a)).toBe(true);
  });
  it('encode bytes as base64url without padding', () => {
    expect(encodeShareToken(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_');
  });
  it('shape check refuses short, long and odd tokens', () => {
    expect(isShareTokenShape('demo-share-books')).toBe(true);
    expect(isShareTokenShape('short')).toBe(false);
    expect(isShareTokenShape('a'.repeat(65))).toBe(false);
    expect(isShareTokenShape('abc/def+ghi=jkl.mnop')).toBe(false);
    expect(isShareTokenShape(undefined)).toBe(false);
  });
});

describe('isValidShareTarget', () => {
  it('tiers need a real section slug', () => {
    expect(isValidShareTarget('tiers', 'books')).toBe(true);
    expect(isValidShareTarget('tiers', 'toString')).toBe(false);
    expect(isValidShareTarget('tiers', 'podcasts')).toBe(false);
  });
  it('years are four digits', () => {
    expect(isValidShareTarget('year', '2026')).toBe(true);
    expect(isValidShareTarget('year', '26')).toBe(false);
  });
  it('lists are an id', () => {
    expect(isValidShareTarget('list', 'clx123')).toBe(true);
    expect(isValidShareTarget('list', '../etc')).toBe(false);
    expect(isValidShareTarget('list', 5)).toBe(false);
  });
});

describe('publicShare', () => {
  it('shows an active link', () => {
    expect(publicShare(link())).toMatchObject({ kind: 'tiers', target: 'books' });
  });
  it('hides unknown and revoked links alike', () => {
    expect(publicShare(null)).toBeNull();
    expect(publicShare(link({ revokedAt: new Date() }))).toBeNull();
  });
  it('hides links of an unknown kind or a broken target', () => {
    expect(publicShare(link({ kind: 'notes' }))).toBeNull();
    expect(publicShare(link({ target: 'nope' }))).toBeNull();
  });
});

describe('canManageShare', () => {
  it('only the owner', () => {
    expect(canManageShare(link(), 'u1')).toBe(true);
    expect(canManageShare(link(), 'u2')).toBe(false);
    expect(canManageShare(null, 'u1')).toBe(false);
  });
});

describe('reusableShare', () => {
  it('returns the newest active link for the same kind and target of that user', () => {
    const older = link({ id: 'old', createdAt: new Date('2026-01-01') });
    const newer = link({ id: 'new', createdAt: new Date('2026-02-01') });
    const revoked = link({ id: 'rev', createdAt: new Date('2026-03-01'), revokedAt: new Date() });
    const other = link({ id: 'other', userId: 'u2', createdAt: new Date('2026-04-01') });
    const movies = link({ id: 'movies', target: 'movies', createdAt: new Date('2026-04-01') });
    expect(reusableShare([older, newer, revoked, other, movies], 'u1', 'tiers', 'books')?.id).toBe('new');
    expect(reusableShare([revoked, other], 'u1', 'tiers', 'books')).toBeNull();
  });
});

describe('sharePath', () => {
  it('is /s/<token>', () => {
    expect(sharePath('abc')).toBe('/s/abc');
  });
});

describe('tierPngFileName', () => {
  it('names the section and the day', () => {
    expect(tierPngFileName('books', '2026-10-28')).toBe('hoard-books-tiers-2026-10-28.png');
  });
});

describe('yearPngFileName', () => {
  it('names the year', () => {
    expect(yearPngFileName(2026)).toBe('hoard-2026-in-review.png');
  });
});
