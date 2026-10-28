// ───────────────────────────────────────────────────────────────────────────
//  Fetching a stranger's web page from the server (spec 2.4: the Goodreads
//  ISBN and the <title> of an unknown link), without letting a link reach
//  into the server's own network (SSRF).
//
//  - http/https only, ports 80/443 only, no user:password@;
//  - the host name is resolved with dns.lookup({all: true}) at connect time
//    (the http `lookup` hook, so the checked address is the one connected to)
//    and refused if ANY answer is private, loopback, link-local, CGNAT,
//    unique-local or multicast (src/lib/url-safety.ts classifiers);
//  - redirects are followed by hand, at most 3, each hop checked again;
//  - 5 s for the whole thing, at most 512 KB read, text/html only.
//
//  Server-only (node:http). The policy pieces are pure and tested; the DNS
//  step takes an injected resolver in tests.
// ───────────────────────────────────────────────────────────────────────────

import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';

import { isBlockedIp } from '@/lib/url-safety';

export const PAGE_FETCH_TIMEOUT_MS = 5000;
export const PAGE_MAX_BYTES = 512 * 1024;
export const PAGE_MAX_REDIRECTS = 3;

const USER_AGENT = 'Mozilla/5.0 (compatible; Hoard/1.0; +https://hoard.timhufnagel.org)';

const isIpLiteral = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');

/** Why a page URL may not be fetched, or null when it may (before DNS). */
export function pageUrlProblem(raw: string | URL): string | null {
  let url: URL;
  try {
    url = typeof raw === 'string' ? new URL(raw) : raw;
  } catch {
    return 'Not a valid link.';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only http and https links can be read.';
  if (url.username || url.password) return 'Links with a user name or password are not read.';
  // `port` is '' for the scheme's default; an explicit 80/443 is fine too.
  if (url.port && url.port !== '80' && url.port !== '443') return 'Only the standard web ports are read.';
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host) return 'Not a valid link.';
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'Local addresses are not read.';
  }
  // A dotless name would resolve through the server's search domains.
  if (!isIpLiteral(host) && !host.includes('.')) return 'Local addresses are not read.';
  if (isIpLiteral(host) && isBlockedIp(host)) return 'Local and private network addresses are not read.';
  return null;
}

/** Why a set of DNS answers is refused (none, or any private), or null. */
export function resolvedProblem(addresses: Array<Pick<LookupAddress, 'address'>>): string | null {
  if (addresses.length === 0) return 'That host does not resolve.';
  if (addresses.some((a) => isBlockedIp(a.address))) return 'That host points into a private network.';
  return null;
}

/**
 * The next hop of a redirect, or why it is not followed: a missing Location,
 * too many hops (`hops` = redirects already followed), or a target that
 * fails `pageUrlProblem`. Relative Locations resolve against `current`.
 */
export function redirectTarget(
  current: URL,
  location: string | undefined,
  hops: number,
): { ok: true; url: URL } | { ok: false; reason: string } {
  if (!location) return { ok: false, reason: 'Redirect without a target.' };
  if (hops >= PAGE_MAX_REDIRECTS) return { ok: false, reason: 'Too many redirects.' };
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    return { ok: false, reason: 'Redirect to an invalid link.' };
  }
  const problem = pageUrlProblem(next);
  return problem ? { ok: false, reason: problem } : { ok: true, url: next };
}

export type Resolver = (host: string) => Promise<LookupAddress[]>;

const systemResolver: Resolver = (host) => dnsLookup(host, { all: true, verbatim: true });

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * A `lookup` for http.request that resolves every address of the host and
 * refuses the connection if any is private. Node may ask for one address or
 * for all (`options.all`, happy eyeballs); both are answered.
 */
export function guardedLookup(resolve: Resolver = systemResolver) {
  return (hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback) => {
    const wantAll = typeof options === 'object' && options !== null && options.all === true;
    resolve(hostname).then(
      (addresses) => {
        const problem = resolvedProblem(addresses);
        if (problem) {
          const err: NodeJS.ErrnoException = new Error(problem);
          err.code = 'EBLOCKED';
          callback(err, wantAll ? [] : '', 0);
          return;
        }
        if (wantAll) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      },
      (err: NodeJS.ErrnoException) => callback(err, wantAll ? [] : '', 0),
    );
  };
}

interface Hop {
  status: number;
  location?: string;
  html?: string;
}

function requestOnce(url: URL, resolve: Resolver, signal: AbortSignal): Promise<Hop> {
  return new Promise((done, fail) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        // Cast: Node's LookupFunction overloads don't accept a single generic handler.
        lookup: guardedLookup(resolve) as unknown as http.RequestOptions['lookup'],
        signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-encoding': 'identity',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          done({ status, location: res.headers.location });
          return;
        }
        const type = String(res.headers['content-type'] ?? '').toLowerCase();
        if (status >= 400 || !type.startsWith('text/html')) {
          res.destroy();
          done({ status });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () => done({ status, html: Buffer.concat(chunks).toString('utf8') });
        res.on('data', (chunk: Buffer) => {
          const room = PAGE_MAX_BYTES - size;
          if (room <= 0) return;
          chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          size += Math.min(chunk.length, room);
          if (size >= PAGE_MAX_BYTES) {
            res.destroy();
            finish();
          }
        });
        res.on('end', finish);
        res.on('error', () => (size > 0 ? finish() : fail(new Error('Read failed'))));
      },
    );
    req.on('error', fail);
    req.end();
  });
}

/**
 * Fetch a public web page's HTML, or null when it is refused, unreachable,
 * not HTML, or slower than 5 s. Never throws.
 */
export async function fetchPublicPage(
  raw: string,
  deps: { resolve?: Resolver } = {},
): Promise<{ url: string; html: string } | null> {
  if (pageUrlProblem(raw)) return null;
  const resolve = deps.resolve ?? systemResolver;
  const signal = AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS);
  let url = new URL(raw);
  try {
    for (let hops = 0; ; hops++) {
      const hop = await requestOnce(url, resolve, signal);
      if (hop.status >= 300 && hop.status < 400) {
        const next = redirectTarget(url, hop.location, hops);
        if (!next.ok) return null;
        url = next.url;
        continue;
      }
      return hop.html !== undefined ? { url: url.toString(), html: hop.html } : null;
    }
  } catch {
    return null;
  }
}
