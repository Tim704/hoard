import { describe, expect, it } from 'vitest';

import { takeLoginRate, takeRegisterRate, usernameProblem } from './auth-rules';
import { clientIp } from './api-auth';

describe('usernameProblem (new accounts)', () => {
  it('accepts 3–32 letters, digits, _ . -', () => {
    for (const u of ['tim', 'Tim_704', 'a.b-c', 'x'.repeat(32)]) expect(usernameProblem(u), u).toBeNull();
  });
  it('refuses short, long and odd characters', () => {
    expect(usernameProblem('ab')).toMatch(/at least 3/);
    expect(usernameProblem('x'.repeat(33))).toMatch(/at most 32/);
    for (const u of ['tim hufnagel', 'tim@x', '<script>', 'ümlaut', 'a/b']) expect(usernameProblem(u), u).toMatch(/only use/);
  });
});

describe('login and register brakes', () => {
  const now = 5_000_000_000;
  it('allows 10 attempts a minute per username, across IPs', () => {
    for (let i = 0; i < 10; i++) expect(takeLoginRate('Victim', `10.0.0.${i}`, now + i)).toBeNull();
    expect(takeLoginRate('victim', '10.0.1.1', now + 20)).toMatch(/Too many sign-in attempts/);
  });
  it('allows 10 attempts a minute per IP, across usernames', () => {
    for (let i = 0; i < 10; i++) expect(takeLoginRate(`user${i}`, '203.0.113.9', now + i)).toBeNull();
    expect(takeLoginRate('someone', '203.0.113.9', now + 20)).toMatch(/Too many sign-in attempts/);
  });
  it('caps a username at 100 attempts a day', () => {
    const t0 = now + 10 * 86_400_000;
    let blocked: string | null = null;
    for (let i = 0; i < 101; i++) blocked = takeLoginRate('daily', `198.51.100.${i % 250}`, t0 + i * 61_000 / 10);
    expect(blocked).toMatch(/Too many/);
  });
  it('allows 5 sign-ups an hour per IP', () => {
    for (let i = 0; i < 5; i++) expect(takeRegisterRate('192.0.2.1', now + i * 60_000)).toBeNull();
    expect(takeRegisterRate('192.0.2.1', now + 10 * 60_000)).toMatch(/Too many new accounts/);
    expect(takeRegisterRate('192.0.2.2', now + 10 * 60_000)).toBeNull();
    expect(takeRegisterRate('192.0.2.1', now + 61 * 60_000)).toBeNull();
  });
  it('reads the IP from CF-Connecting-IP, then X-Forwarded-For, else unknown', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(new Headers({ 'x-forwarded-for': '3.3.3.3, 10.0.0.1' }))).toBe('3.3.3.3');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
