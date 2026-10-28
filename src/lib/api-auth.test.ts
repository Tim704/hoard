import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const updateMany = vi.fn(async () => ({ count: 1 }));
vi.mock('@/lib/prisma', () => ({ prisma: { apiToken: { findUnique: (...a: unknown[]) => findUnique(...a), updateMany: (...a: unknown[]) => updateMany(...(a as [])) } } }));

const { apiJson, apiRoute, clientIp } = await import('@/lib/api-auth');
const { generateToken, hashToken } = await import('@/lib/api-tokens');

const token = generateToken(Buffer.alloc(32, 3));
const req = (auth?: string) => new Request('http://x/api/v1/stats', { headers: auth ? { authorization: auth } : {} });

describe('apiRoute', () => {
  beforeEach(() => {
    findUnique.mockReset();
    updateMany.mockClear();
  });

  it('answers 401 with a Bearer challenge for missing, malformed and unknown tokens', async () => {
    const handler = vi.fn();
    const missing = await apiRoute(req(), handler);
    expect(missing.status).toBe(401);
    expect(missing.headers.get('WWW-Authenticate')).toBe('Bearer realm="hoard"');

    const bad = await apiRoute(req('Bearer nope'), handler);
    expect(bad.status).toBe(401);
    expect(bad.headers.get('WWW-Authenticate')).toContain('error="invalid_token"');

    findUnique.mockResolvedValueOnce(null);
    const revoked = await apiRoute(req(`Bearer ${token}`), handler);
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({ error: { code: 'unauthorized' } });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashToken(token) } }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler as the token's owner, touches lastUsedAt, then rate limits", async () => {
    const owner = { id: 'tok-route-test', userId: 'user-1', lastUsedAt: null };
    findUnique.mockResolvedValue(owner);
    const seen: string[] = [];
    const ok = await apiRoute(req(`Bearer ${token}`), async (userId) => {
      seen.push(userId);
      return apiJson({ hello: 'world' });
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(ok.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(ok.headers.get('X-RateLimit-Remaining')).toBe('59');
    expect(seen).toEqual(['user-1']);
    expect(updateMany).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 59; i++) await apiRoute(req(`Bearer ${token}`), async () => apiJson({}));
    const limited = await apiRoute(req(`Bearer ${token}`), async () => apiJson({}));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await limited.json()).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it('turns a handler crash into a JSON 500', async () => {
    findUnique.mockResolvedValue({ id: 'tok-crash', userId: 'u', lastUsedAt: new Date() });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await apiRoute(req(`Bearer ${token}`), async () => {
      throw new Error('boom');
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 'internal', message: 'Something went wrong. Try again later.' } });
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('failed authentications per IP', () => {
  const from = (headers: Record<string, string>) => new Request('http://x/api/v1/stats', { headers });

  it('reads the IP from CF-Connecting-IP, then the first X-Forwarded-For hop', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(new Headers({ 'x-forwarded-for': ' 3.3.3.3 , 10.0.0.1' }))).toBe('3.3.3.3');
    expect(clientIp(new Headers())).toBe('unknown');
  });

  it('turns the 31st failure in a minute into 429s that skip the token lookup', async () => {
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
    const ip = { 'cf-connecting-ip': '203.0.113.7' };
    for (let i = 0; i < 30; i++) {
      const res = await apiRoute(from({ ...ip, authorization: `Bearer ${token}` }), vi.fn());
      expect(res.status).toBe(401);
    }
    const crossing = await apiRoute(from({ ...ip, authorization: `Bearer ${token}` }), vi.fn());
    expect(crossing.status).toBe(429);
    expect(Number(crossing.headers.get('Retry-After'))).toBeGreaterThan(0);
    const lookups = findUnique.mock.calls.length;
    const blocked = await apiRoute(from({ ...ip, authorization: `Bearer ${token}` }), vi.fn());
    expect(blocked.status).toBe(429);
    expect(findUnique.mock.calls.length).toBe(lookups);
    // Missing headers count too, and another address is unaffected.
    expect((await apiRoute(from(ip), vi.fn())).status).toBe(429);
    expect((await apiRoute(from({ 'cf-connecting-ip': '198.51.100.1' }), vi.fn())).status).toBe(401);
  });

  it('never counts successful requests', async () => {
    findUnique.mockReset();
    findUnique.mockResolvedValue({ id: 'tok-ok-ip', userId: 'u', lastUsedAt: new Date() });
    const ip = { 'cf-connecting-ip': '192.0.2.44', authorization: `Bearer ${token}` };
    for (let i = 0; i < 40; i++) {
      const res = await apiRoute(from(ip), async () => apiJson({}));
      expect(res.status).toBe(i < 60 ? 200 : 429);
    }
  });
});
