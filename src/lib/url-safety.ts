// ───────────────────────────────────────────────────────────────────────────
//  Push-target URL check (ntfy topic / Discord webhook). Pure and client-safe.
//
//  Only https, and never a host that points into the server's own network by
//  name or IP literal: localhost, loopback, private (RFC 1918), CGNAT/Tailscale
//  (100.64/10), link-local, unique-local IPv6, and IPv4-mapped forms of these.
//  No DNS resolution: a public name that resolves privately is not caught, but
//  push errors are reported only as generic categories (notify-push.ts), so the
//  server can't be used to probe hosts.
// ───────────────────────────────────────────────────────────────────────────

function ipv4Blocked(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT, Tailscale
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

/** An IPv6 address as its eight 16-bit groups (embedded dotted IPv4 allowed), or null. */
function ipv6Groups(host: string): number[] | null {
  let h = host.toLowerCase();
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some((x) => x > 255)) return null;
    h = `${h.slice(0, v4.index)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(':') : []);
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function ipv6Blocked(host: string): boolean {
  const g = ipv6Groups(host);
  if (!g) return false;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  // ::/96: unspecified, loopback and the deprecated IPv4-compatible form.
  if (zeros(0, 6)) return true;
  // ::ffff:0:0/96 (IPv4-mapped).
  if (zeros(0, 5) && g[5] === 0xffff) return ipv4Blocked(v4Of(g[6], g[7]));
  // ::ffff:0:0:0/96 (SIIT translated).
  if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) return ipv4Blocked(v4Of(g[6], g[7]));
  // 64:ff9b::/96 (NAT64, embedded IPv4) and 64:ff9b:1::/48 (local-use NAT64).
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 1 || (zeros(2, 6) && ipv4Blocked(v4Of(g[6], g[7])));
  // 2002::/16 (6to4, embedded IPv4).
  if (g[0] === 0x2002) return ipv4Blocked(v4Of(g[1], g[2]));
  return (
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (g[0] & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
    (g[0] & 0xff00) === 0xff00 // multicast
  );
}

/**
 * True for an IP address (v4 or v6, no brackets) inside any private,
 * loopback, link-local, CGNAT, unique-local, site-local, multicast,
 * benchmarking or reserved range, including IPv4 embedded in IPv6 (mapped,
 * compatible, SIIT, NAT64, 6to4). Non-IP strings return false. Used by the
 * page-fetch guard (src/lib/safe-fetch.ts) on every DNS answer.
 */
export function isBlockedIp(address: string): boolean {
  const a = address.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) return ipv4Blocked(a);
  // An unparseable IPv6-looking string is refused rather than trusted.
  if (a.includes(':')) return ipv6Groups(a) === null || ipv6Blocked(a);
  return false;
}

/** Why a push URL is refused, or null when it is acceptable. */
export function pushUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'Enter a full URL.';
  }
  if (url.protocol !== 'https:') return 'Only https:// URLs are accepted.';
  if (url.username || url.password) return 'URLs with a user name or password are not accepted.';
  // WHATWG URL normalises IPv4 shorthands (2130706433, 0x7f.1) to dotted form.
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host) return 'Enter a full URL.';
  if (host === 'localhost' || host.endsWith('.localhost') || ipv4Blocked(host) || (host.includes(':') && ipv6Blocked(host))) {
    return 'Local and private network addresses are not accepted.';
  }
  return null;
}

export const isAllowedPushUrl = (raw: string | null | undefined): raw is string =>
  typeof raw === 'string' && pushUrlProblem(raw) === null;
