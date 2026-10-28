import { describe, expect, it, vi } from 'vitest';

import watchProviders from './apis/__fixtures__/tmdb-watch-providers.json';
import { PROVIDER_BACKOFF_MS, refreshTmdbKeys, type Backoff } from './watch-refresh';

const KEYS = ['movie:1:DE', 'movie:2:DE', 'tv:3:DE', 'movie:4:DE'];

function deps(fetchJson: (kind: 'movie' | 'tv', id: string) => Promise<unknown>, backoff: Backoff = { until: 0 }) {
  const save = vi.fn(async () => undefined);
  return { configured: true, fetchJson: vi.fn(fetchJson), save, backoff, now: () => 1_000_000 };
}

describe('refreshTmdbKeys', () => {
  it('fetches and caches every stale key while TMDB answers (404 = nowhere)', async () => {
    const d = deps(async (_k, id) => (id === '2' ? null : watchProviders));
    const out = await refreshTmdbKeys(KEYS, d);
    expect(d.fetchJson).toHaveBeenCalledTimes(4);
    expect(d.save).toHaveBeenCalledTimes(4);
    expect(out.get('movie:1:DE')).toMatchObject({ status: 'ok', providers: { stream: [{ name: 'Amazon Prime Video' }, {}, {}] } });
    expect(out.get('movie:2:DE')).toMatchObject({ status: 'ok', providers: { stream: [] } });
  });

  it('stops at the first failure: the rest fail without being fetched, and a backoff starts', async () => {
    const backoff = { until: 0 };
    const d = deps(async (_k, id) => {
      if (id === '2') throw new Error('timeout');
      return watchProviders;
    }, backoff);
    const out = await refreshTmdbKeys(KEYS, d);
    expect(d.fetchJson).toHaveBeenCalledTimes(2);
    expect([...out.values()].map((o) => o.status)).toEqual(['ok', 'failed', 'failed', 'failed']);
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(backoff.until).toBe(1_000_000 + PROVIDER_BACKOFF_MS);
  });

  it('makes no request at all while backing off, and again after it ends', async () => {
    const during = deps(async () => watchProviders, { until: 1_000_001 });
    expect([...(await refreshTmdbKeys(KEYS, during)).values()].every((o) => o.status === 'failed')).toBe(true);
    expect(during.fetchJson).not.toHaveBeenCalled();
    const after = deps(async () => watchProviders, { until: 1_000_000 });
    await refreshTmdbKeys(KEYS, after);
    expect(after.fetchJson).toHaveBeenCalledTimes(4);
  });

  it('reports "not configured" without a key and never fetches', async () => {
    const d = { ...deps(async () => watchProviders), configured: false };
    const out = await refreshTmdbKeys(KEYS, d);
    expect([...out.values()].every((o) => o.status === 'not-configured')).toBe(true);
    expect(d.fetchJson).not.toHaveBeenCalled();
  });
});
