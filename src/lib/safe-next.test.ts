import { describe, expect, it } from 'vitest';

import { loginUrlFor, safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it('keeps same-site paths with their query', () => {
    expect(safeNextPath('/add?url=https%3A%2F%2Fanilist.co%2Fanime%2F1')).toBe('/add?url=https%3A%2F%2Fanilist.co%2Fanime%2F1');
    expect(safeNextPath('/books?open=abc#x')).toBe('/books?open=abc#x');
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/a/../books')).toBe('/books');
    expect(safeNextPath('/add?url=%2F%2Fexample.com')).toBe('/add?url=%2F%2Fexample.com');
  });

  it('refuses anything that could leave the site', () => {
    for (const bad of [
      'https://evil.example/',
      '//evil.example/',
      '/\\evil.example',
      '\\\\evil.example',
      '/\t/evil.example',
      'javascript:alert(1)',
      'dashboard',
      '',
      ' ',
      null,
      undefined,
      42,
      '/login?next=/x',
      '/register',
      '/.//evil.com',
      '/..//evil.com',
      '/a/..//evil.com',
      '/a/.././/evil.com/x?y=1',
      '/%2F%2Fevil.com',
      '/%2f/evil.com',
      '/%5Cevil.com',
      '/%5C%5Cevil.com',
      '/%E0%A4%A',
      `/${'a'.repeat(2100)}`,
    ]) {
      expect(safeNextPath(bad), String(bad)).toBeNull();
    }
  });
});

describe('loginUrlFor', () => {
  it('builds the login URL with an encoded next, or plain /login', () => {
    expect(loginUrlFor('/add?url=https://anilist.co/anime/1')).toBe('/login?next=%2Fadd%3Furl%3Dhttps%3A%2F%2Fanilist.co%2Fanime%2F1');
    expect(loginUrlFor(null)).toBe('/login');
    expect(loginUrlFor('/')).toBe('/login');
    expect(loginUrlFor('//evil.example')).toBe('/login');
  });
});
