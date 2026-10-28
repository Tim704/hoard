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
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT, Tailscale
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast and reserved
  );
}

function ipv6Blocked(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::' || h === '::1') return true;
  // IPv4-mapped / -compatible: ::ffff:7f00:1 or ::ffff:127.0.0.1
  const mapped = /^::(?:ffff:)?(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(h);
  if (mapped) {
    if (mapped[1]) return ipv4Blocked(mapped[1]);
    const hi = parseInt(mapped[2], 16);
    const lo = parseInt(mapped[3], 16);
    return ipv4Blocked(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(h.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 // multicast
  );
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
