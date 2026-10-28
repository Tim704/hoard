// ───────────────────────────────────────────────────────────────────────────
//  The public API's front door (spec 8.7). Server-only. Every /api/v1 route
//  handler runs through `apiRoute`:
//  - the token comes from `Authorization: Bearer …` only (cookies are never
//    read, so a browser session can't be used through the API);
//  - it is hashed and looked up by hash (src/lib/api-tokens.ts); missing,
//    malformed, unknown and revoked tokens all get 401 with
//    `WWW-Authenticate: Bearer`;
//  - 60 requests a minute per token (the shared limiter), else 429 with
//    `Retry-After`;
//  - failed authentications are counted per client IP (30 a minute); past
//    that, the IP gets 429 before any token lookup. The IP is Cloudflare's
//    `CF-Connecting-IP`, else the first `X-Forwarded-For` hop, else
//    "unknown". Hoard is only reachable through the Cloudflare tunnel (or on
//    localhost), so these headers come from the tunnel, not the client;
//    exposed directly, a client could vary them to dodge this brake (the
//    per-token limit and 256-bit tokens still stand);
//  - lastUsedAt is updated at most once a minute (a conditional update, so
//    parallel requests don't all write);
//  - the handler only ever sees the token owner's id (G2), and answers JSON
//    with `Cache-Control: no-store`.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { hashToken, parseBearer, shouldTouch, TOUCH_EVERY_MS } from '@/lib/api-tokens';
import { API_FAIL_LIMITS, API_LIMITS, peekRate, takeApiRate, takeRate, type RateDecision } from '@/lib/rate-limit';

const BASE_HEADERS = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };

/** A JSON response with the API's headers. */
export function apiJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

/** An error response: `{ "error": { "code", "message" } }`. */
export function apiError(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return apiJson({ error: { code, message } }, status, headers);
}

function unauthorized(message: string, invalid: boolean): Response {
  const challenge = invalid ? 'Bearer realm="hoard", error="invalid_token"' : 'Bearer realm="hoard"';
  return apiError(401, 'unauthorized', message, { 'WWW-Authenticate': challenge });
}

/** The client's IP as the tunnel reports it (see the header comment). */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first || 'unknown';
}

function tooManyFailures(rate: Extract<RateDecision, { ok: false }>): Response {
  return apiError(429, 'rate_limited', `Too many failed sign-ins from your address. Try again in ${rate.retryAfterSec} s.`, {
    'Retry-After': String(rate.retryAfterSec),
  });
}

export type ApiHandler = (userId: string) => Promise<Response>;

export async function apiRoute(req: Request, handler: ApiHandler): Promise<Response> {
  const failKey = `api-fail:${clientIp(req.headers)}`;
  const blocked = peekRate(failKey, API_FAIL_LIMITS);
  if (!blocked.ok) return tooManyFailures(blocked);
  // Every 401 counts against the IP; the one that crosses the line is a 429.
  const fail = (message: string, invalid: boolean) => {
    const rate = takeRate(failKey, API_FAIL_LIMITS);
    return rate.ok ? unauthorized(message, invalid) : tooManyFailures(rate);
  };

  const bearer = parseBearer(req.headers.get('authorization'));
  if (bearer.kind === 'missing') return fail('Send an API token as "Authorization: Bearer hoard_…".', false);
  if (bearer.kind === 'malformed') return fail('That is not a Hoard API token.', true);

  let token: { id: string; userId: string; lastUsedAt: Date | null } | null;
  try {
    token = await prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(bearer.token) },
      select: { id: true, userId: true, lastUsedAt: true },
    });
  } catch (err) {
    console.error('[api] token lookup failed:', err);
    return apiError(500, 'internal', 'Something went wrong. Try again later.');
  }
  if (!token) return fail('This token is unknown or has been revoked.', true);

  const rate = takeApiRate(token.id);
  const limitHeaders = {
    'X-RateLimit-Limit': String(API_LIMITS.perMinute),
    'X-RateLimit-Remaining': String(Math.max(0, API_LIMITS.perMinute - rate.stamps.filter((t) => t > Date.now() - 60_000).length)),
  };
  if (!rate.ok) {
    return apiError(429, 'rate_limited', `Too many requests: ${API_LIMITS.perMinute} a minute per token. Try again in ${rate.retryAfterSec} s.`, {
      ...limitHeaders,
      'Retry-After': String(rate.retryAfterSec),
    });
  }

  const now = new Date();
  if (shouldTouch(token.lastUsedAt, now)) {
    // Only the first request of the minute writes; failures don't fail the request.
    void prisma.apiToken
      .updateMany({
        where: {
          id: token.id,
          OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - TOUCH_EVERY_MS) } }],
        },
        data: { lastUsedAt: now },
      })
      .catch((err) => console.error('[api] lastUsedAt update failed:', err));
  }

  try {
    const res = await handler(token.userId);
    for (const [k, v] of Object.entries(limitHeaders)) res.headers.set(k, v);
    return res;
  } catch (err) {
    console.error('[api] request failed:', err);
    return apiError(500, 'internal', 'Something went wrong. Try again later.', limitHeaders);
  }
}
