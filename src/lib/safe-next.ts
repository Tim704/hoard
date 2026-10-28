// ───────────────────────────────────────────────────────────────────────────
//  The `next` parameter of the login flow: where to go after signing in
//  (e.g. back to a shared /add?url=… link). Pure and client-safe.
//
//  Only a same-site relative path is accepted, so the parameter can never be
//  turned into an open redirect: it must start with one "/", not "//" or
//  "/\" (protocol-relative), contain no backslashes or control characters,
//  and still be on our origin once parsed. The login pages themselves are
//  refused (no loop).
// ───────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_ORIGIN = 'http://hoard.invalid';

/** A safe path (+ query + hash) to continue to, or null. */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 2000) return null;
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(s)) return null;
  let url: URL;
  try {
    url = new URL(s, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  if (/^\/(login|register)(\/|$)/.test(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

/** The login URL that comes back to `path` afterwards (plain /login when unsafe). */
export function loginUrlFor(path: string | null | undefined): string {
  const next = safeNextPath(path);
  return next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login';
}
