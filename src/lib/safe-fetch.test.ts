import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { fetchPublicPage, guardedLookup, pageUrlProblem, redirectTarget, resolvedProblem, type Resolver } from './safe-fetch';
import { isBlockedIp } from './url-safety';

describe('isBlockedIp', () => {
  it('blocks private, loopback, link-local, CGNAT, unique-local and multicast addresses', () => {
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '100.64.0.1', '169.254.169.254', '0.0.0.0', '224.0.0.1',
      '::1', '::', '0:0:0:0:0:0:0:0', '0:0:0:0:0:0:0:1', 'fd00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:a00:1',
      '0:0:0:0:0:ffff:7f00:1', '[::1]',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public addresses and ignores names', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '100.128.0.1', '2606:4700::1111', 'example.com']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

describe('pageUrlProblem', () => {
  it('accepts public http(s) links on the standard ports', () => {
    for (const u of ['https://www.goodreads.com/book/show/1', 'http://example.com/x', 'https://example.com:443/x', 'http://example.com:80/', 'https://8.8.8.8/']) {
      expect(pageUrlProblem(u), u).toBeNull();
    }
  });

  it('refuses other schemes, ports, credentials, local names and private IP literals', () => {
    for (const u of [
      'ftp://example.com/', 'file:///etc/passwd', 'https://example.com:8443/', 'http://example.com:22/',
      'https://user:pw@example.com/', 'http://localhost/', 'http://foo.localhost/', 'http://printer.local/', 'http://intranet/',
      'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data',
      'http://[::ffff:10.0.0.1]/', 'not a url',
    ]) {
      expect(pageUrlProblem(u), u).not.toBeNull();
    }
  });
});

describe('resolvedProblem', () => {
  it('refuses when there are no answers or ANY answer is private', () => {
    expect(resolvedProblem([])).not.toBeNull();
    expect(resolvedProblem([{ address: '93.184.216.34' }, { address: '10.0.0.1' }])).not.toBeNull();
    expect(resolvedProblem([{ address: '2606:2800:220:1::1' }, { address: '::1' }])).not.toBeNull();
    expect(resolvedProblem([{ address: '93.184.216.34' }, { address: '2606:2800:220:1::1' }])).toBeNull();
  });
});

describe('redirectTarget', () => {
  const here = new URL('https://example.com/a/b');

  it('follows relative and absolute public targets', () => {
    expect(redirectTarget(here, '/c', 0)).toEqual({ ok: true, url: new URL('https://example.com/c') });
    expect(redirectTarget(here, 'https://other.example.org/x', 2)).toMatchObject({ ok: true });
  });

  it('stops after three hops, without a Location, and on unsafe targets', () => {
    expect(redirectTarget(here, '/c', 3)).toMatchObject({ ok: false });
    expect(redirectTarget(here, undefined, 0)).toMatchObject({ ok: false });
    expect(redirectTarget(here, 'http://127.0.0.1/admin', 0)).toMatchObject({ ok: false });
    expect(redirectTarget(here, 'http://localhost:3000/', 0)).toMatchObject({ ok: false });
    expect(redirectTarget(here, 'file:///etc/passwd', 0)).toMatchObject({ ok: false });
    expect(redirectTarget(here, 'https://example.com:8080/', 0)).toMatchObject({ ok: false });
  });
});

describe('guardedLookup', () => {
  const resolver =
    (map: Record<string, string[]>): Resolver =>
    async (host) =>
      (map[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

  const call = (lookup: ReturnType<typeof guardedLookup>, host: string, options: { all?: boolean } | undefined) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
      lookup(host, options, (err, address, family) => resolve({ err, address, family })),
    );

  it('answers with the first address, or all of them, for a public host', async () => {
    const lookup = guardedLookup(resolver({ 'example.com': ['93.184.216.34', '2606:2800:220:1::1'] }));
    expect(await call(lookup, 'example.com', {})).toEqual({ err: null, address: '93.184.216.34', family: 4 });
    const all = await call(lookup, 'example.com', { all: true });
    expect(all.err).toBeNull();
    expect(all.address).toHaveLength(2);
  });

  it('refuses a host with any private answer (DNS rebinding to the LAN)', async () => {
    const lookup = guardedLookup(resolver({ 'evil.example': ['93.184.216.34', '192.168.1.10'], 'none.example': [] }));
    const res = await call(lookup, 'evil.example', { all: true });
    expect(res.err?.code).toBe('EBLOCKED');
    expect((await call(lookup, 'none.example', undefined)).err).not.toBeNull();
  });
});

describe('fetchPublicPage', () => {
  it('never connects to a name that resolves to loopback', async () => {
    let hits = 0;
    const server = createServer((_req, res) => {
      hits++;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<title>secret</title>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { port } = server.address() as AddressInfo;
      // Port 80 is the only one allowed, so point the name at the server's
      // address and check the guard refuses before connecting.
      const resolve: Resolver = async () => [{ address: '127.0.0.1', family: 4 }];
      expect(await fetchPublicPage('http://sneaky.example/', { resolve })).toBeNull();
      expect(await fetchPublicPage(`http://127.0.0.1:${port}/`)).toBeNull();
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  });
});
