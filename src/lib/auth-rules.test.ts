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
  it('allows 10 attempts a minute per username+IP', () => {
    for (let i = 0; i < 10; i++) expect(takeLoginRate('Victim', '10.0.0.1', now + i)).toBeNull();
    expect(takeLoginRate('victim', '10.0.0.1', now + 20)).toMatch(/Too many sign-in attempts/);
  });

  it('one IP exhausting its budget does not block the same username from another IP (re-review 3)', () => {
    for (let i = 0; i < 12; i++) takeLoginRate('owner', '203.0.113.66', now + i);
    expect(takeLoginRate('owner', '203.0.113.66', now + 30)).toMatch(/Too many/);
    expect(takeLoginRate('owner', '198.51.100.7', now + 30)).toBeNull();
  });

  it('one IP flooding >1000 attempts never locks the username out from another IP (re-review 4)', () => {
    const t0 = now + 100 * 86_400_000;
    for (let i = 0; i < 1500; i++) takeLoginRate('owner2', '203.0.113.200', t0 + i * 100);
    expect(takeLoginRate('owner2', '203.0.113.200', t0 + 150_100)).toMatch(/Too many/);
    expect(takeLoginRate('owner2', '198.51.100.20', t0 + 150_100)).toBeNull();
  });

  it('is atomic: an attempt refused by the IP budget charges nothing to the pair budget', () => {
    const t0 = now + 200 * 86_400_000;
    for (let i = 0; i < 10; i++) expect(takeLoginRate(`u${i}`, '192.0.2.77', t0 + i)).toBeNull();
    // The address is spent: 20 refused attempts at "alice" from it…
    for (let i = 0; i < 20; i++) expect(takeLoginRate('alice', '192.0.2.77', t0 + 20 + i)).toMatch(/Too many/);
    // …charged nothing: a minute later alice gets her full 10 from there.
    for (let i = 0; i < 10; i++) expect(takeLoginRate('alice', '192.0.2.77', t0 + 61_000 + i)).toBeNull();
  });  it('allows 10 attempts a minute per IP, across usernames', () => {
    for (let i = 0; i < 10; i++) expect(takeLoginRate(`user${i}`, '203.0.113.9', now + i)).toBeNull();
    expect(takeLoginRate('someone', '203.0.113.9', now + 20)).toMatch(/Too many sign-in attempts/);
  });
  it('caps a username+IP at 100 attempts a day', () => {
    const t0 = now + 10 * 86_400_000;
    let blocked: string | null = null;
    for (let i = 0; i < 101; i++) blocked = takeLoginRate('daily', '198.51.100.1', t0 + i * 61_000 / 10);
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
