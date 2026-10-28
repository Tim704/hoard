import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  cleanTokenName,
  decodeCursor,
  encodeCursor,
  generateToken,
  hashToken,
  isTokenShape,
  pageOf,
  parseBearer,
  parseLimit,
  shouldTouch,
} from './api-tokens';

describe('tokens', () => {
  it('are hoard_ + 32 bytes of base64url', () => {
    const t = generateToken(Buffer.alloc(32, 0xff));
    expect(t).toBe('hoard_' + '_'.repeat(42) + '8');
    expect(isTokenShape(t)).toBe(true);
    const random = generateToken();
    expect(random).toMatch(/^hoard_[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(random);
  });

  it('are stored as their SHA-256 hex hash', () => {
    const t = generateToken(Buffer.alloc(32, 1));
    expect(hashToken(t)).toBe(createHash('sha256').update(t).digest('hex'));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toBe(hashToken(t + 'x'));
  });

  it('come from a Bearer header only in the right shape', () => {
    const t = generateToken(Buffer.alloc(32, 7));
    expect(parseBearer(`Bearer ${t}`)).toEqual({ kind: 'token', token: t });
    expect(parseBearer(`bearer   ${t}  `)).toEqual({ kind: 'token', token: t });
    expect(parseBearer(null)).toEqual({ kind: 'missing' });
    expect(parseBearer('  ')).toEqual({ kind: 'missing' });
    expect(parseBearer(`Basic ${t}`)).toEqual({ kind: 'malformed' });
    expect(parseBearer('Bearer hoard_short')).toEqual({ kind: 'malformed' });
    expect(parseBearer(`Bearer ${t} extra`)).toEqual({ kind: 'malformed' });
    expect(parseBearer(`Bearer ${t.replace('hoard_', 'other_')}`)).toEqual({ kind: 'malformed' });
  });

  it('have names of 1–40 characters', () => {
    expect(cleanTokenName('  Home   dashboard ')).toBe('Home dashboard');
    expect(cleanTokenName('')).toBeNull();
    expect(cleanTokenName(null)).toBeNull();
    expect(cleanTokenName('x'.repeat(50))).toHaveLength(40);
  });

  it('touch lastUsedAt at most once a minute', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    expect(shouldTouch(null, now)).toBe(true);
    expect(shouldTouch(new Date('2026-10-28T11:59:30Z'), now)).toBe(false);
    expect(shouldTouch(new Date('2026-10-28T11:59:00Z'), now)).toBe(true);
  });
});

describe('paging', () => {
  it('reads limit 1–100, default 50', () => {
    expect(parseLimit(null)).toBe(50);
    expect(parseLimit('')).toBe(50);
    expect(parseLimit('10')).toBe(10);
    expect(parseLimit('500')).toBe(100);
    expect(parseLimit('0')).toBeNull();
    expect(parseLimit('-3')).toBeNull();
    expect(parseLimit('2.5')).toBeNull();
    expect(parseLimit('abc')).toBeNull();
  });

  it('round-trips cursors and rejects foreign ones', () => {
    const c = { createdAt: new Date('2026-10-28T10:00:00.123Z'), id: 'ckabc' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor('not a cursor!')).toBeNull();
    expect(decodeCursor(Buffer.from('{"t":"nope","i":"x"}').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('[1,2]').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('{"t":"2026-01-01T00:00:00Z","i":""}').toString('base64url'))).toBeNull();
    expect(decodeCursor('x'.repeat(401))).toBeNull();
  });

  it('cuts a page and points at the next one only when there is more', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, createdAt: new Date(Date.UTC(2026, 0, i + 1)) }));
    const first = pageOf(rows.slice(0, 3), 2);
    expect(first.items.map((r) => r.id)).toEqual(['a0', 'a1']);
    expect(decodeCursor(first.nextCursor!)).toEqual({ id: 'a1', createdAt: rows[1].createdAt });
    expect(pageOf(rows.slice(0, 2), 2).nextCursor).toBeNull();
    expect(pageOf([], 2)).toEqual({ items: [], nextCursor: null });
  });
});
