import { describe, expect, it } from 'vitest';

import { openToken, sealToken, secretConfigured } from './secret-box';

const SECRET = 'x'.repeat(40);

describe('secret box', () => {
  it('round-trips a token', () => {
    const sealed = sealToken('jwt.token.value', SECRET);
    expect(sealed).not.toContain('jwt.token.value');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(openToken(sealed, SECRET)).toBe('jwt.token.value');
  });

  it('uses a fresh IV each time', () => {
    expect(sealToken('a', SECRET)).not.toBe(sealToken('a', SECRET));
  });

  it('detects tampering', () => {
    const sealed = sealToken('secret-token', SECRET);
    const [v, iv, tag, body] = sealed.split('.');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 1;
    expect(openToken([v, iv, tag, flipped.toString('base64url')].join('.'), SECRET)).toBeNull();
    const badTag = Buffer.from(tag, 'base64url');
    badTag[0] ^= 1;
    expect(openToken([v, iv, badTag.toString('base64url'), body].join('.'), SECRET)).toBeNull();
  });

  it('fails with another secret, a missing secret or junk', () => {
    const sealed = sealToken('t', SECRET);
    expect(openToken(sealed, 'y'.repeat(40))).toBeNull();
    expect(openToken(sealed, undefined)).toBeNull();
    expect(openToken('plaintext', SECRET)).toBeNull();
    expect(openToken(null, SECRET)).toBeNull();
  });

  it('refuses to seal without a long enough secret', () => {
    expect(secretConfigured('short')).toBe(false);
    expect(secretConfigured(undefined)).toBe(false);
    expect(secretConfigured(SECRET)).toBe(true);
    expect(() => sealToken('t', 'short')).toThrow(/HOARD_SECRET/);
  });
});
